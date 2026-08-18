package com.thx.traveljournal.migration;

import com.thx.traveljournal.support.FullFormEntities;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class FlywayMigrationTest {

    @Test
    void shouldMigrateEmptyPostgresDatabase() throws Exception {
        String jdbcUrl = System.getenv("FLYWAY_TEST_JDBC_URL");
        String username = System.getenv().getOrDefault("FLYWAY_TEST_DB_USERNAME", "travel_journal");
        String password = System.getenv().getOrDefault("FLYWAY_TEST_DB_PASSWORD", "travel_journal");
        PostgreSQLContainer<?> postgres = null;

        if (jdbcUrl == null || jdbcUrl.isBlank()) {
            Assumptions.assumeTrue(
                    DockerClientFactory.instance().isDockerAvailable(),
                    "本机没有 Docker，跳过 PostgreSQL 迁移验证"
            );

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

            var migrateResult = flyway.migrate();

            assertThat(migrateResult.success).isTrue();

            // 确认数据库已经迁移到最新版本。
            // 后续新增 V23/V24/V25 migration 无需修改测试。
            assertThat(flyway.info().current())
                    .isNotNull();

            assertThat(flyway.info().pending())
                    .isEmpty();

            try (Connection connection = DriverManager.getConnection(jdbcUrl, username, password)) {

                assertThat(count(connection, """
                        select count(*)
                        from information_schema.tables
                        where table_schema='public'
                          and table_name='journal_entry'
                        """))
                        .isEqualTo(1);

                assertThat(count(connection, """
                        select count(*)
                        from information_schema.columns
                        where table_schema='public'
                          and table_name='moment'
                          and column_name in (
                              'client_id',
                              'occurred_local_date',
                              'occurred_zone_id',
                              'utc_offset_minutes'
                          )
                        """))
                        .isEqualTo(4);

                assertThat(count(connection, """
                        select count(*)
                        from pg_indexes
                        where schemaname='public'
                          and indexname in (
                              'uq_moment_trip_client_id',
                              'idx_moment_trip_local_date',
                              'uq_moment_media_client_id'
                          )
                        """))
                        .isEqualTo(3);

                assertThat(value(connection, """
                        select is_nullable
                        from information_schema.columns
                        where table_schema='public'
                          and table_name='journal_entry'
                          and column_name='trip_id'
                        """))
                        .isEqualTo("YES");

                assertThat(count(connection, """
                        select count(*)
                        from information_schema.columns
                        where table_schema='public'
                          and table_name='theme_preset'
                          and column_name='override_json'
                        """))
                        .isEqualTo(1);

                assertThat(value(connection, """
                        select column_default
                        from information_schema.columns
                        where table_schema='public'
                          and table_name='trip_stop'
                          and column_name='coordinate_system'
                        """))
                        .contains("WGS84");

                assertThat(count(connection, """
                        select count(*)
                        from information_schema.columns
                        where table_schema='public'
                          and table_name='moment'
                          and column_name='coordinate_system'
                        """))
                        .isEqualTo(1);

                assertNotNullAllowlistMatchesSchema(connection);
            }

        } finally {
            if (postgres != null) {
                postgres.stop();
            }
        }
    }


    /**
     * 用真实 schema 校对 {@link FullFormEntities} 里的 NOT NULL 白名单。
     *
     * <p>那份白名单决定了哪些列可以不标 {@code FieldStrategy.ALWAYS}。要是把一个其实
     * 可空的列错写成 NOT NULL，「清空必须真的能清空」这条规则就对它悄悄失效了，而且
     * 不带数据库的那条单测永远发现不了——只有这里能。</p>
     */
    private static void assertNotNullAllowlistMatchesSchema(Connection connection) throws Exception {
        for (FullFormEntities.Entry entity : FullFormEntities.ALL) {
            Set<String> actualNotNull = new HashSet<>();
            try (PreparedStatement statement = connection.prepareStatement("""
                    select column_name
                    from information_schema.columns
                    where table_schema='public'
                      and table_name=?
                      and is_nullable='NO'
                    """)) {

                statement.setString(1, entity.table());
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) actualNotNull.add(result.getString(1));
                }
            }
            actualNotNull.removeAll(FullFormEntities.AUDIT_COLUMNS);
            // 主键由数据库生成，不参与表单写入
            actualNotNull.remove("id");

            assertThat(actualNotNull)
                    .as("%s 的 NOT NULL 白名单和数据库对不上了", entity.table())
                    .isEqualTo(entity.notNullColumns());
        }
    }


    private static int count(Connection connection, String sql) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet result = statement.executeQuery()) {

            result.next();
            return result.getInt(1);
        }
    }


    private static void awaitDatabase(
            String jdbcUrl,
            String username,
            String password
    ) throws Exception {

        Exception last = null;

        for (int attempt = 0; attempt < 30; attempt++) {
            try (Connection ignored =
                         DriverManager.getConnection(jdbcUrl, username, password)) {

                return;

            } catch (Exception error) {
                last = error;
                Thread.sleep(500);
            }
        }

        throw last == null
                ? new IllegalStateException("PostgreSQL 未就绪")
                : last;
    }


    private static String value(Connection connection, String sql) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet result = statement.executeQuery()) {

            result.next();
            return result.getString(1);
        }
    }
}