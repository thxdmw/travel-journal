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
