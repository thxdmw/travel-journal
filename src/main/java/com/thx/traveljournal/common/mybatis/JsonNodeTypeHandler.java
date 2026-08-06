package com.thx.traveljournal.common.mybatis;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedJdbcTypes;
import org.apache.ibatis.type.MappedTypes;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * Jackson {@link JsonNode} 与 Postgres {@code jsonb} 字段的转换器。
 *
 * <p>写入时按 {@code Types.OTHER} 传字符串，交给驱动按 jsonb 处理；
 * 读取时解析成 JsonNode。主题配置和日记模板数据都走这里。</p>
 */
@MappedTypes(JsonNode.class)
@MappedJdbcTypes(JdbcType.OTHER)
public class JsonNodeTypeHandler extends BaseTypeHandler<JsonNode> {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public void setNonNullParameter(PreparedStatement ps, int index, JsonNode parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setObject(index, parameter.toString(), java.sql.Types.OTHER);
    }

    @Override
    public JsonNode getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return read(rs.getString(columnName));
    }

    @Override
    public JsonNode getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return read(rs.getString(columnIndex));
    }

    @Override
    public JsonNode getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return read(cs.getString(columnIndex));
    }

    private JsonNode read(String value) throws SQLException {
        if (value == null || value.isBlank()) return null;
        try {
            return MAPPER.readTree(value);
        } catch (Exception ex) {
            throw new SQLException("无法解析 JSONB 数据", ex);
        }
    }
}
