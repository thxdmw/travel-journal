package com.thx.traveljournal.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import static org.assertj.core.api.Assertions.assertThat;

class FlywayMigrationTest {
    @Test
    void shouldMigrateEmptyPostgresDatabase() throws Exception {
        String jdbcUrl = System.getenv("FLYWAY_TEST_JDBC_URL");
        String username = System.getenv().getOrDefault("FLYWAY_TEST_DB_USERNAME", "travel_journal");
        String password = System.getenv().getOrDefault("FLYWAY_TEST_DB_PASSWORD", "travel_journal");
        PostgreSQLContainer<?> postgres = null;

        if (jdbcUrl == null || jdbcUrl.isBlank()) {
            Assumptions.assumeTrue(DockerClientFactory.instance().isDockerAvailable(),
                    "本机没有 Docker，跳过 PostgreSQL 迁移验证");
            postgres = new PostgreSQLContainer<>("postgres:17-alpine")
                    .withDatabaseName("travel_journal")
                    .withUsername(username)
                    .withPassword(password);
            postgres.start();
            jdbcUrl = postgres.getJdbcUrl();
        }

        try {
            awaitDatabase(jdbcUrl, username, password);
            Flyway flyway = Flyway.configure()
                    .dataSource(jdbcUrl, username, password)
                    .locations("classpath:db/migration")
                    .load();
            assertThat(flyway.migrate().success).isTrue();

            try (Connection connection = DriverManager.getConnection(jdbcUrl, username, password)) {
                assertThat(count(connection, """
                        select count(*) from information_schema.tables
                        where table_schema='public' and table_name='journal_entry'
                        """)).isEqualTo(1);
                assertThat(count(connection, """
                        select count(*) from information_schema.columns
                        where table_schema='public' and table_name='moment'
                          and column_name in ('client_id','occurred_local_date','occurred_zone_id','utc_offset_minutes')
                        """)).isEqualTo(4);
                assertThat(count(connection, """
                        select count(*) from pg_indexes
                        where schemaname='public'
                          and indexname in ('uq_moment_trip_client_id','idx_moment_trip_local_date','uq_moment_media_client_id')
                        """)).isEqualTo(3);
                assertThat(value(connection, """
                        select is_nullable from information_schema.columns
                        where table_schema='public' and table_name='journal_entry' and column_name='trip_id'
                        """)).isEqualTo("YES");
                assertThat(value(connection, """
                        select version from flyway_schema_history
                        where success = true order by installed_rank desc limit 1
                        """)).isEqualTo("18");
            }
        } finally {
            if (postgres != null) {
                postgres.stop();
            }
        }
    }

    private static int count(Connection connection, String sql) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet result = statement.executeQuery()) {
            result.next();
            return result.getInt(1);
        }
    }

    private static void awaitDatabase(String jdbcUrl, String username, String password) throws Exception {
        Exception last = null;
        for (int attempt = 0; attempt < 30; attempt++) {
            try (Connection ignored = DriverManager.getConnection(jdbcUrl, username, password)) {
                return;
            } catch (Exception error) {
                last = error;
                Thread.sleep(500);
            }
        }
        throw last == null ? new IllegalStateException("PostgreSQL 未就绪") : last;
    }

    private static String value(Connection connection, String sql) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet result = statement.executeQuery()) {
            result.next();
            return result.getString(1);
        }
    }
}
