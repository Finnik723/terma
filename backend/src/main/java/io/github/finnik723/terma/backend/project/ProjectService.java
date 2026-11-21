package io.github.finnik723.terma.backend.project;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProjectService {
    record Project(UUID id, String name, String createdBy, Instant createdAt, Instant updatedAt) {}

    private static final String MEMBER_PROJECTS = """
        SELECT p.id, p.name, author.username, p.created_at, p.updated_at
        FROM project_member member
        JOIN project p ON p.id = member.project_id
        JOIN user_account author ON author.id = p.created_by
        WHERE member.user_id = ?
        """;

    private static final RowMapper<Project> PROJECT = (row, index) -> new Project(
        row.getObject("id", UUID.class), row.getString("name"), row.getString("username"),
        row.getObject("created_at", OffsetDateTime.class).toInstant(),
        row.getObject("updated_at", OffsetDateTime.class).toInstant());

    private final JdbcTemplate jdbc;

    public ProjectService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    List<Project> list(UUID accountId) {
        return jdbc.query(MEMBER_PROJECTS + "ORDER BY p.updated_at DESC, p.id", PROJECT, accountId);
    }

    Optional<Project> find(UUID accountId, UUID projectId) {
        return jdbc.query(MEMBER_PROJECTS + "AND p.id = ?", PROJECT, accountId, projectId).stream().findFirst();
    }

    @Transactional
    public Project create(UUID accountId, String name) {
        var projectId = UUID.randomUUID();
        jdbc.update("INSERT INTO project (id, name, created_by) VALUES (?, ?, ?)", projectId, name, accountId);
        jdbc.update("INSERT INTO project_member (project_id, user_id, role) VALUES (?, ?, 'OWNER')", projectId, accountId);
        return find(accountId, projectId).orElseThrow();
    }
}
