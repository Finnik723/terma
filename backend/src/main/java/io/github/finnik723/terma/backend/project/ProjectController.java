package io.github.finnik723.terma.backend.project;

import java.net.URI;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import io.github.finnik723.terma.backend.auth.AccountPrincipal;
import io.github.finnik723.terma.backend.project.ProjectService.Project;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {
    private static final String EXPECTED_USERNAME = "X-Expected-Username";
    private static final int MAX_NAME_LENGTH = 120;
    private static final Pattern INVALID_NAME_CODE_POINT = Pattern.compile("[\\p{Cc}\\p{Cs}]");
    // Each whitespace run is considered once, even in a long invalid request.
    private static final Pattern OUTER_WHITESPACE = Pattern.compile("(?U)\\A\\s++|(?<!\\s)\\s++\\z");

    private final ProjectService projects;

    public ProjectController(ProjectService projects) { this.projects = projects; }

    @GetMapping
    List<Project> list(@AuthenticationPrincipal AccountPrincipal account,
                       @RequestHeader(name = EXPECTED_USERNAME, required = false) String expectedUsername) {
        return projects.list(accountId(account, expectedUsername));
    }

    @GetMapping("/{id}")
    ResponseEntity<Project> get(@AuthenticationPrincipal AccountPrincipal account,
                                @RequestHeader(name = EXPECTED_USERNAME, required = false) String expectedUsername,
                                @PathVariable UUID id) {
        return ResponseEntity.of(projects.find(accountId(account, expectedUsername), id));
    }

    @PostMapping
    ResponseEntity<Project> create(@AuthenticationPrincipal AccountPrincipal account,
                                   @RequestHeader(name = EXPECTED_USERNAME, required = false) String expectedUsername,
                                   @RequestHeader(name = "Idempotency-Key", required = false) UUID creationKey,
                                   @RequestBody JsonNode request) {
        UUID accountId = accountId(account, expectedUsername);
        var field = request.path("name");
        String name = field.isString() ? OUTER_WHITESPACE.matcher(field.asString()).replaceAll("") : "";
        if (name.isEmpty() || name.codePointCount(0, name.length()) > MAX_NAME_LENGTH
                || INVALID_NAME_CODE_POINT.matcher(name).find()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid project name");
        }
        return projects.create(accountId, name, creationKey)
            .map(project -> ResponseEntity.created(URI.create("/api/projects/" + project.id())).body(project))
            .orElseGet(() -> ResponseEntity.notFound().build());
    }

    private static UUID accountId(AccountPrincipal account, String expectedUsername) {
        if (expectedUsername != null && !account.getUsername().equals(expectedUsername)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Session account changed");
        }
        return account.accountId();
    }
}
