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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {
    private static final int MAX_NAME_LENGTH = 120;
    private static final Pattern INVALID_NAME_CODE_POINT = Pattern.compile("[\\p{Cc}\\p{Cs}]");
    // Each whitespace run is considered once, even in a long invalid request.
    private static final Pattern OUTER_WHITESPACE = Pattern.compile("(?U)\\A\\s++|(?<!\\s)\\s++\\z");

    private final ProjectService projects;

    public ProjectController(ProjectService projects) { this.projects = projects; }

    @GetMapping
    List<Project> list(@AuthenticationPrincipal AccountPrincipal account) {
        return projects.list(account.accountId());
    }

    @GetMapping("/{id}")
    ResponseEntity<Project> get(@AuthenticationPrincipal AccountPrincipal account, @PathVariable UUID id) {
        return ResponseEntity.of(projects.find(account.accountId(), id));
    }

    @PostMapping
    ResponseEntity<Project> create(@AuthenticationPrincipal AccountPrincipal account, @RequestBody JsonNode request) {
        var field = request.path("name");
        String name = field.isString() ? OUTER_WHITESPACE.matcher(field.asString()).replaceAll("") : "";
        if (name.isEmpty() || name.codePointCount(0, name.length()) > MAX_NAME_LENGTH
                || INVALID_NAME_CODE_POINT.matcher(name).find()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid project name");
        }
        var project = projects.create(account.accountId(), name);
        return ResponseEntity.created(URI.create("/api/projects/" + project.id())).body(project);
    }
}
