"""Offline checks of contract documents/fixtures; never runs a solver."""

import copy
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from urllib.parse import unquote

from jsonschema import Draft202012Validator
from referencing import Registry, Resource


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts' / 'equilibrium' / 'v1'
EXAMPLES = CONTRACT / 'examples'
VERSION = re.compile(r'^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$')
FIXTURES = {
    'request': 'request', 'request-multicomponent': 'request',
    'request-properties': 'request', 'request-invalid-input': 'request',
    'chemical-system-pure': 'chemical-system',
    'chemical-system-multicomponent': 'chemical-system',
    'result-converged': 'result', 'result-invalid-input': 'result',
    'result-multicomponent': 'result', 'result-properties': 'result',
    'capabilities': 'capabilities', 'capabilities-properties': 'capabilities',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def finite(value):
    if isinstance(value, float):
        require(math.isfinite(value), 'Nonfinite or overflowing JSON number')
    elif isinstance(value, dict):
        for child in value.values():
            finite(child)
    elif isinstance(value, list):
        for child in value:
            finite(child)


def parse(text):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate JSON key: ' + key)
            result[key] = value
        return result

    def invalid_number(value):
        raise ValueError('Non-JSON number: ' + value)

    value = json.loads(text, object_pairs_hook=pairs, parse_constant=invalid_number)
    finite(value)
    return value


def read(path):
    return parse(path.read_text(encoding='utf-8'))


def unique(items, key, label):
    keys = [key(item) for item in items]
    require(len(set(keys)) == len(keys), 'Duplicate ' + label)


def decimal(value):
    return Decimal(str(value))


def check_capabilities(capabilities):
    """Cross-field/key constraints which JSON Schema cannot compare."""
    unique(capabilities['availableProperties'], lambda p: (p['code'], p['scope']),
           'capabilities (code, scope)')
    unique(capabilities['supportedSolverOptions'], lambda p: p['name'], 'solver option name')
    for option in capabilities['supportedSolverOptions']:
        lower = option.get('minimum', option.get('exclusiveMinimum'))
        upper = option.get('maximum')
        if lower is not None and upper is not None:
            require(lower <= upper, 'Reversed solver option range')
            if 'exclusiveMinimum' in option:
                require(lower < upper, 'Empty exclusive solver option range')
        if 'default' in option:
            default = option['default']
            if 'minimum' in option:
                require(default >= option['minimum'], 'Default below minimum')
            if 'exclusiveMinimum' in option:
                require(default > option['exclusiveMinimum'], 'Default at/below exclusive minimum')
            if upper is not None:
                require(default <= upper, 'Default above maximum')
    conditions = capabilities.get('limits', {}).get('conditions', {})
    for low, high in [('minTemperatureK', 'maxTemperatureK'), ('minPressurePa', 'maxPressurePa')]:
        if low in conditions and high in conditions:
            require(conditions[low] <= conditions[high], 'Reversed conditions range')


def select_version(client_versions, capabilities):
    """Fixture-level check of the documented exact-intersection rule."""
    supported = capabilities['supportedContractVersions']
    require(all(VERSION.fullmatch(v) for v in [*client_versions, *supported]), 'Invalid version identifier')
    common = set(client_versions).intersection(supported)
    require(bool(common), 'No mutually supported calculation contract')
    return max(common, key=lambda v: tuple(map(int, v.split('.'))))


def check_properties(request, result, capabilities):
    """Check metadata and all required subjects of a hand-authored result."""
    descriptors = {(p['code'], p['scope']): p for p in capabilities['availableProperties']}
    solution = result['solution']
    subjects = {
        'SYSTEM': [solution],
        'PHASE': solution['phases'],
        'SPECIES': [species for phase in solution['phases'] for species in phase['species']],
    }
    for scope, holders in subjects.items():
        for holder in holders:
            properties = holder.get('properties', [])
            unique(properties, lambda p: p['code'], 'property code on one subject')
            for prop in properties:
                key = (prop['code'], scope)
                require(key in descriptors, 'Property not declared for this scope')
                descriptor = descriptors[key]
                require(prop['unit'] == descriptor['unit'], 'Property unit differs from capabilities')
                if descriptor['referenceConventionRequired']:
                    require(bool(prop.get('referenceConvention')), 'Missing property reference convention')
    requirements = request.get('requirements', [])
    unique(requirements, lambda p: (p['code'], p['scope']), 'requirement (code, scope)')
    for requirement in requirements:
        code, scope = requirement['code'], requirement['scope']
        require((code, scope) in descriptors, 'Unsupported required property/scope')
        require(bool(subjects[scope]), 'No present subjects for requirement')
        for holder in subjects[scope]:
            require(any(p['code'] == code for p in holder.get('properties', [])),
                    'Missing required property on a present ' + scope + ' subject')


def compare_amounts(left, right, absolute, relative):
    residual = Decimal(0)
    for element in set(left) | set(right):
        actual, expected = decimal(left.get(element, 0)), decimal(right.get(element, 0))
        difference = abs(actual - expected)
        require(difference <= absolute + relative * abs(expected), 'Element balance failed: ' + element)
        residual = max(residual, difference)
    return residual


def check_balance(request, result, system):
    require(request['calculationId'] == result['calculationId'], 'Correlation mismatch')
    require(request['conditions'] == result['conditions'], 'Conditions mismatch')
    require(request['chemicalSystemRef'] == system['ref'] == result['provenance']['chemicalSystemRef'],
            'Chemical system reference mismatch')
    require(request['thermodynamicDataRef'] == result['provenance']['thermodynamicDataRef'],
            'Thermodynamic data reference mismatch')
    unique(system['species'], lambda s: s['speciesId'], 'species definition')
    unique(system['phases'], lambda p: p['phaseDefinitionId'], 'phase definition')
    unique(result['solution']['phases'], lambda p: p['phaseInstanceId'], 'phase instance')
    elements = set(system['elements'])
    require(set(request['system']['elementAmountsMol']) <= elements, 'Unknown input element')
    species = {s['speciesId']: s for s in system['species']}
    phases = {p['phaseDefinitionId']: p for p in system['phases']}
    for definition in species.values():
        require(set(definition['elementStoichiometry']) <= elements, 'Unknown species element')
    for definition in phases.values():
        require(set(definition['allowedSpeciesIds']) <= set(species), 'Unknown allowed species')
    options = result['provenance']['effectiveSolverOptions']
    absolute = decimal(options['balanceAbsoluteToleranceMol'])
    relative = decimal(options['balanceRelativeTolerance'])
    report = result['diagnostics']['balance']
    require(decimal(report['absoluteToleranceMol']) == absolute and
            decimal(report['relativeTolerance']) == relative, 'Diagnostic tolerance mismatch')
    total, charge, residual = defaultdict(Decimal), Decimal(0), Decimal(0)
    for phase in result['solution']['phases']:
        require(phase['phaseDefinitionId'] in phases, 'Unknown phase definition')
        definition = phases[phase['phaseDefinitionId']]
        require(phase['phaseType'] == definition['phaseType'], 'Phase type mismatch')
        require(definition['modelRef'] in result['provenance']['appliedModels'], 'Missing applied model')
        unique(phase['species'], lambda s: s['speciesId'], 'species occurrence in a phase')
        calculated = defaultdict(Decimal)
        for entry in phase['species']:
            require(entry['speciesId'] in definition['allowedSpeciesIds'], 'Species not allowed in phase')
            spec = species[entry['speciesId']]
            quantity = decimal(entry['amountMol'])
            charge += quantity * decimal(spec['charge'])
            for element, coefficient in spec['elementStoichiometry'].items():
                calculated[element] += quantity * decimal(coefficient)
        residual = max(residual, compare_amounts(calculated, phase['elementAmountsMol'], absolute, relative))
        for element, quantity in phase['elementAmountsMol'].items():
            total[element] += decimal(quantity)
    residual = max(residual, compare_amounts(total, result['solution']['elementAmountsMol'], absolute, relative))
    residual = max(residual, compare_amounts(result['solution']['elementAmountsMol'],
                                           request['system']['elementAmountsMol'], absolute, relative))
    require(charge == 0, 'Synthetic fixture is not neutral')
    require(report['passed'] and residual == decimal(report['maxAbsoluteResidualMol']), 'Balance report mismatch')
    return residual


class ContractChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schemas = {p.name.removesuffix('.schema.json'): read(p) for p in CONTRACT.glob('*.schema.json')}
        cls.registry = Registry().with_resources((s['$id'], Resource.from_contents(s)) for s in cls.schemas.values())
        cls.validators = {name: Draft202012Validator(schema, registry=cls.registry)
                          for name, schema in cls.schemas.items()}
        cls.examples = {p.stem: read(p) for p in EXAMPLES.glob('*.json')}

    def example(self, name):
        return copy.deepcopy(self.examples[name])

    def valid(self, schema, value):
        self.validators[schema].validate(value)

    def invalid(self, schema, value):
        self.assertFalse(self.validators[schema].is_valid(value))

    def test_metaschemas_and_every_local_ref(self):
        self.assertEqual(set(self.schemas), {'common', 'request', 'result', 'capabilities', 'chemical-system'})
        def visit(value, resolver):
            if isinstance(value, dict):
                if '$ref' in value:
                    resolver.lookup(value['$ref'])
                for child in value.values():
                    visit(child, resolver)
            elif isinstance(value, list):
                for child in value:
                    visit(child, resolver)
        for schema in self.schemas.values():
            Draft202012Validator.check_schema(schema)
            visit(schema, self.registry.resolver(schema['$id']))

    def test_all_committed_fixtures(self):
        self.assertEqual(set(self.examples), set(FIXTURES), 'Every JSON fixture must be checked')
        for name, schema in FIXTURES.items():
            with self.subTest(fixture=name):
                if name == 'request-invalid-input':
                    self.invalid(schema, self.examples[name])
                else:
                    self.valid(schema, self.examples[name])
                if schema == 'capabilities':
                    check_capabilities(self.examples[name])

    def test_request_rejections(self):
        changes = [('conditions', 'temperatureK', 0), ('conditions', 'pressurePa', -1),
                   ('system', 'mode', 'OPEN'), ('system', 'elementAmountsMol', {}),
                   ('system', 'elementAmountsMol', {'H': 0, 'O': 0}),
                   ('solverOptions', 'maxIterations', 0), ('solverOptions', 'maxIterations', 1.5),
                   ('solverOptions', 'balanceAbsoluteToleranceMol', 0),
                   ('solverOptions', 'balanceRelativeTolerance', -1),
                   ('solverOptions', 'unknownOption', 1)]
        for section, key, value in changes:
            with self.subTest(section=section, key=key, value=value):
                request = self.example('request'); request[section][key] = value
                self.invalid('request', request)
        for field in ['hchComObject', 'optimizerMatrix', 'H', 'S', 'V']:
            request = self.example('request'); request[field] = 1
            self.invalid('request', request)
        request = self.example('request'); request['contractVersion'] = '2.0'
        self.invalid('request', request)

    def test_optional_requirements_and_empty_options(self):
        request = self.example('request'); del request['requirements']; request['solverOptions'] = {}
        self.valid('request', request)

    def test_requirements_need_scope_and_have_no_subject_selector(self):
        for requirements in [['GIBBS_ENERGY'], [{'code': 'GIBBS_ENERGY'}],
                             [{'code': 'ACTIVITY', 'scope': 'SYSTEM'}],
                             [{'code': 'PH', 'scope': 'SPECIES'}],
                             [{'code': 'ACTIVITY', 'scope': 'SPECIES', 'subject': 'one'}]]:
            request = self.example('request'); request['requirements'] = requirements
            self.invalid('request', request)

    def test_same_code_different_scopes_and_species_properties(self):
        request, result, cap = map(self.example, ['request-properties', 'result-properties', 'capabilities-properties'])
        self.valid('request', request); self.valid('result', result); check_capabilities(cap)
        check_properties(request, result, cap)
        for holder in [result['solution'], result['solution']['phases'][0], result['solution']['phases'][0]['species'][0]]:
            changed = copy.deepcopy(result)
            if holder is result['solution']:
                del changed['solution']['properties']
            elif holder is result['solution']['phases'][0]:
                del changed['solution']['phases'][0]['properties']
            else:
                del changed['solution']['phases'][0]['species'][0]['properties']
            with self.assertRaises(ValueError):
                check_properties(request, changed, cap)

    def test_species_requirement_applies_to_every_phase_occurrence(self):
        request, result, cap = map(self.example, ['request-multicomponent', 'result-multicomponent', 'capabilities-properties'])
        request['requirements'] = [{'code': 'ACTIVITY', 'scope': 'SPECIES'}]
        for phase in result['solution']['phases']:
            for species in phase['species']:
                species['properties'] = [{'code': 'ACTIVITY', 'value': 1, 'unit': '1'}]
        self.valid('result', result); check_properties(request, result, cap)
        del result['solution']['phases'][1]['species'][0]['properties']
        with self.assertRaises(ValueError):
            check_properties(request, result, cap)

    def test_phase_requirement_applies_to_every_present_phase(self):
        request, result, cap = map(self.example, ['request-multicomponent', 'result-multicomponent', 'capabilities-properties'])
        request['requirements'] = [{'code': 'GIBBS_ENERGY', 'scope': 'PHASE'}]
        energy = {'code': 'GIBBS_ENERGY', 'value': -1, 'unit': 'J', 'referenceConvention': 'demo:zero'}
        for phase in result['solution']['phases']:
            phase['properties'] = [dict(energy)]
        check_properties(request, result, cap)
        del result['solution']['phases'][1]['properties']
        with self.assertRaises(ValueError):
            check_properties(request, result, cap)

    def test_no_subjects_and_unavailable_scope_are_not_vacuous_success(self):
        request, result, cap = map(self.example, ['request-properties', 'result-properties', 'capabilities-properties'])
        result['solution']['phases'] = []
        with self.assertRaises(ValueError):
            check_properties(request, result, cap)
        result = self.example('result-properties'); cap['availableProperties'] = []
        with self.assertRaises(ValueError):
            check_properties(request, result, cap)

    def test_property_uniqueness_and_custom_reference_convention(self):
        request, result, cap = map(self.example, ['request-properties', 'result-properties', 'capabilities-properties'])
        custom = {'code': 'demo:energy', 'scope': 'SPECIES', 'valueType': 'NUMBER', 'unit': 'J/mol',
                  'referenceConventionRequired': True, 'description': 'Synthetic custom energy'}
        cap['availableProperties'].append(custom)
        species = result['solution']['phases'][0]['species'][0]
        species['properties'].append({'code': 'demo:energy', 'value': 0, 'unit': 'J/mol'})
        with self.assertRaises(ValueError):
            check_properties(request, result, cap)
        species['properties'][-1]['referenceConvention'] = 'demo:zero'
        check_properties(request, result, cap)
        species['properties'].append(copy.deepcopy(species['properties'][0]))
        with self.assertRaises(ValueError):
            check_properties(request, result, cap)

    def test_failed_result_never_has_solution(self):
        for status in ['INVALID_INPUT', 'UNSUPPORTED', 'INFEASIBLE', 'ITERATION_LIMIT', 'NUMERICAL_FAILURE']:
            value = self.example('result-invalid-input'); value['status'] = status
            self.valid('result', value)
            value['solution'] = self.example('result-converged')['solution']
            self.invalid('result', value)
        value = self.example('result-invalid-input'); value['diagnostics']['messages'][0]['severity'] = 'INFO'
        self.invalid('result', value)

    def test_success_needs_solution_provenance_conditions_and_balance(self):
        for field in ['solution', 'provenance', 'conditions']:
            value = self.example('result-converged'); del value[field]; self.invalid('result', value)
        value = self.example('result-converged'); value['provenance']['engine'] = None; self.invalid('result', value)
        value = self.example('result-converged'); del value['diagnostics']['balance']; self.invalid('result', value)
        value = self.example('result-converged'); value['diagnostics']['balance']['passed'] = False
        self.invalid('result', value)

    def test_extended_phase_type_is_readable(self):
        value = self.example('result-converged'); value['solution']['phases'][0]['phaseType'] = 'NEW_PHASE_TYPE'
        self.valid('result', value)

    def test_standard_property_metadata_cannot_disagree_with_values(self):
        cap = self.example('capabilities-properties')
        for field, invalid in [('unit', 'kJ'), ('referenceConventionRequired', False)]:
            value = copy.deepcopy(cap); value['availableProperties'][0][field] = invalid
            self.invalid('capabilities', value)
        ph = {'code': 'PH', 'valueType': 'NUMBER', 'scope': 'PHASE', 'unit': 'mol',
              'referenceConventionRequired': False, 'description': 'Invalid pH unit'}
        cap['availableProperties'].append(ph); self.invalid('capabilities', cap)

    def test_standard_property_units_and_energy_references(self):
        validator = Draft202012Validator({'$ref': self.schemas['common']['$id'] + '#/$defs/property'}, registry=self.registry)
        for code, unit in [('GIBBS_ENERGY', 'J'), ('CHEMICAL_POTENTIAL', 'J/mol')]:
            value = {'code': code, 'value': -1, 'unit': unit, 'referenceConvention': 'demo:zero'}
            validator.validate(value)
            missing_unit = dict(value); del missing_unit['unit']
            self.assertFalse(validator.is_valid(missing_unit))
            del value['referenceConvention']; self.assertFalse(validator.is_valid(value))
        self.assertFalse(validator.is_valid({'code': 'PH', 'value': 7, 'unit': 'mol'}))
        self.assertFalse(validator.is_valid({'code': 'unnamespaced', 'value': 1, 'unit': '1'}))
        validator.validate({'code': 'demo:scalar', 'value': 1, 'unit': '1'})

    def test_capabilities_key_uniqueness(self):
        cap = self.example('capabilities-properties')
        conflicting = copy.deepcopy(cap['availableProperties'][0]); conflicting['description'] += ' conflicting'
        cap['availableProperties'].append(conflicting)
        self.valid('capabilities', cap)
        with self.assertRaises(ValueError):
            check_capabilities(cap)
        cap = self.example('capabilities'); cap['supportedSolverOptions'].append(dict(cap['supportedSolverOptions'][0]))
        with self.assertRaises(ValueError):
            check_capabilities(cap)

    def test_standard_solver_option_metadata(self):
        mutations = [(0, 'valueType', 'NUMBER'), (0, 'unit', 'mol'), (0, 'default', 1.5),
                     (0, 'minimum', 0), (0, 'maximum', 1.5), (0, 'default', -1),
                     (1, 'unit', '1'), (1, 'default', 0), (1, 'minimum', 0),
                     (2, 'valueType', 'INTEGER'), (2, 'minimum', -1)]
        for index, field, invalid in mutations:
            with self.subTest(index=index, field=field, invalid=invalid):
                cap = self.example('capabilities'); cap['supportedSolverOptions'][index][field] = invalid
                self.invalid('capabilities', cap)

    def test_option_ranges_and_defaults(self):
        for changes in [{'minimum': 10, 'maximum': 2}, {'minimum': 5, 'maximum': 10, 'default': 4},
                        {'minimum': 1, 'maximum': 10, 'default': 11}]:
            cap = self.example('capabilities'); cap['supportedSolverOptions'][0].update(changes)
            self.valid('capabilities', cap)
            with self.assertRaises(ValueError):
                check_capabilities(cap)
        cap = self.example('capabilities'); cap['supportedSolverOptions'][1]['exclusiveMinimum'] = 1e-8
        self.valid('capabilities', cap)
        with self.assertRaises(ValueError):
            check_capabilities(cap)

    def test_multiple_calculation_versions_in_capabilities_1_0(self):
        cap = self.example('capabilities-properties')
        self.assertEqual(cap['contractVersion'], '1.0')
        self.assertEqual(cap['supportedContractVersions'], ['1.0', '1.1'])
        self.valid('capabilities', cap)
        self.assertEqual(select_version(['1.0', '1.1'], cap), '1.1')
        self.assertEqual(select_version(['1.0'], cap), '1.0')
        cap['supportedContractVersions'] = ['1.9', '1.10']
        self.valid('capabilities', cap)
        self.assertEqual(select_version(['1.9', '1.10'], cap), '1.10')
        with self.assertRaises(ValueError):
            select_version(['2.0'], cap)

    def test_version_identifiers_and_document_version_are_separate(self):
        for invalid in ['01.0', '1', '1.01', '1.0.0', 'v1.0', '1.1-beta', '1.0\n']:
            cap = self.example('capabilities'); cap['supportedContractVersions'] = [invalid]
            self.invalid('capabilities', cap)
        cap = self.example('capabilities'); cap['contractVersion'] = '1.1'; self.invalid('capabilities', cap)
        cap = self.example('capabilities'); cap['supportedModes'] = ['OPEN']; self.invalid('capabilities', cap)

    def test_strict_json_parser(self):
        for text in ['{"x":NaN}', '{"x":Infinity}', '{"x":-Infinity}', '{"x":1e999}', '{"x":1,"x":2}']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse(text)

    def test_balanced_fixtures_and_homogeneous_transfer(self):
        for req, res, system in [('request', 'result-converged', 'chemical-system-pure'),
                                 ('request-multicomponent', 'result-multicomponent', 'chemical-system-multicomponent'),
                                 ('request-properties', 'result-properties', 'chemical-system-pure')]:
            with self.subTest(result=res):
                self.assertEqual(check_balance(self.examples[req], self.examples[res], self.examples[system]), 0)
                for phase in self.examples[res]['solution']['phases']:
                    for quantity in phase['elementAmountsMol'].values():
                        number = decimal(quantity)
                        self.assertEqual(number * Decimal('.25') + number * Decimal('.75'), number)

    def test_semantic_balance_failure_is_not_hidden_by_schema(self):
        value = self.example('result-converged'); value['solution']['elementAmountsMol']['H'] = 3
        self.valid('result', value)
        with self.assertRaises(ValueError):
            check_balance(self.examples['request'], value, self.examples['chemical-system-pure'])

    def test_unknown_species_and_duplicate_phase_instance(self):
        for mutate in ['species', 'phase']:
            value = self.example('result-multicomponent')
            if mutate == 'species':
                value['solution']['phases'][0]['species'][0]['speciesId'] = 'demo:unknown'
            else:
                value['solution']['phases'][1]['phaseInstanceId'] = value['solution']['phases'][0]['phaseInstanceId']
            self.valid('result', value)
            with self.assertRaises(ValueError):
                check_balance(self.examples['request-multicomponent'], value, self.examples['chemical-system-multicomponent'])

    def test_pure_capabilities_do_not_claim_mixture(self):
        model = self.examples['chemical-system-multicomponent']['phases'][0]['modelRef']
        self.assertNotIn(model, self.examples['capabilities']['supportedPhaseModels'])

    def test_documentation_links_including_contracts(self):
        files = [ROOT / 'README.md', ROOT / 'AGENTS.md']
        for directory in ['docs', 'contracts']:
            files.extend((ROOT / directory).rglob('*.md'))
        for file in files:
            content = re.sub(r'^```[^\n]*\n[\s\S]*?^```\s*$', '', file.read_text(encoding='utf-8'), flags=re.M)
            for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', content):
                if re.match(r'^(https?:|mailto:|#)', target):
                    continue
                self.assertTrue((file.parent / unquote(target.split('#')[0])).resolve().exists(), str(file) + ': ' + target)

    def test_checker_exits_nonzero_for_broken_fixture(self):
        with tempfile.TemporaryDirectory(prefix='terma-contract-check-') as temporary:
            root = Path(temporary)
            (root / 'tools').mkdir()
            script = root / 'tools' / Path(__file__).name
            shutil.copy2(__file__, script)
            fixture_root = root / 'contracts' / 'equilibrium' / 'v1'
            shutil.copytree(CONTRACT, fixture_root)
            command = [sys.executable, str(script), 'ContractChecks.test_all_committed_fixtures']
            options = {'capture_output': True, 'text': True, 'timeout': 30,
                       'creationflags': getattr(subprocess, 'CREATE_NO_WINDOW', 0)}
            good = subprocess.run(command, **options)
            self.assertEqual(good.returncode, 0, good.stderr)
            path = fixture_root / 'examples' / 'request.json'
            invalid = read(path); invalid['conditions']['temperatureK'] = 0
            path.write_text(json.dumps(invalid), encoding='utf-8')
            broken = subprocess.run(command, **options)
            self.assertNotEqual(broken.returncode, 0)
            self.assertIn('temperatureK', broken.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
