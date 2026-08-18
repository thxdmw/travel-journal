package com.thx.traveljournal.common.entity;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfo;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.thx.traveljournal.support.FullFormEntities;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 「清空」必须真的能清空。
 *
 * <p>{@code updateById} 默认跳过 null 字段。对于整表单提交（PUT）的实体，这条默认规则
 * 会把「作者删掉了到达日期」和「这个字段没改」变成同一件事，于是：</p>
 *
 * <pre>
 * arrivalDate = 2026-08-10
 * 作者清空 → arrivalDate = null
 * updateById → 这一列压根不进 UPDATE
 * 重新加载 → 2026-08-10 又回来了
 * </pre>
 *
 * <p>这个 bug 在这个项目里反复长出来过：随手记的 placeName/mood 修过一次，
 * 城市停靠点、行程、支出、日记模板又各自长了一遍。所以这里不逐个字段写死断言，
 * 而是反过来要求：<b>可空字段默认必须是 ALWAYS，NOT NULL 的列要显式登记在白名单里。</b>
 * 以后谁往这些实体上加一个新的可空字段而忘了标注解，这条测试就会红。</p>
 *
 * <p>白名单里的列名对应数据库的 NOT NULL 约束。它们不能标 ALWAYS——漏传时会被写成
 * NULL，直接撞约束。</p>
 */
class NullableUpdateStrategyTest {

    @Test
    void everyNullableColumnOfAFullFormEntityCanBeCleared() {
        for (FullFormEntities.Entry entity : FullFormEntities.ALL) {
            TableInfo table = tableInfo(entity.type());
            List<String> unclearable = table.getFieldList().stream()
                    .filter(field -> !FullFormEntities.AUDIT_COLUMNS.contains(field.getColumn()))
                    .filter(field -> !entity.notNullColumns().contains(field.getColumn()))
                    .filter(field -> field.getUpdateStrategy() != FieldStrategy.ALWAYS)
                    .map(field -> entity.type().getSimpleName() + "." + field.getProperty())
                    .toList();

            assertThat(unclearable)
                    .as("这些可空字段清空之后不会真的写进数据库，"
                            + "请标 @TableField(updateStrategy = FieldStrategy.ALWAYS)，"
                            + "确认它在库里是 NOT NULL 的话就登记到白名单里")
                    .isEmpty();
        }
    }

    @Test
    void notNullColumnsAreNotForcedIntoUpdates() {
        // 反向守一遍：把 NOT NULL 的列标成 ALWAYS，漏传时会写成 NULL 直接撞约束
        for (FullFormEntities.Entry entity : FullFormEntities.ALL) {
            TableInfo table = tableInfo(entity.type());
            List<String> overreaching = table.getFieldList().stream()
                    .filter(field -> !FullFormEntities.AUDIT_COLUMNS.contains(field.getColumn()))
                    .filter(field -> entity.notNullColumns().contains(field.getColumn()))
                    .filter(field -> field.getUpdateStrategy() == FieldStrategy.ALWAYS)
                    .map(field -> entity.type().getSimpleName() + "." + field.getProperty())
                    .toList();

            assertThat(overreaching)
                    .as("这些列在数据库里是 NOT NULL，不该被强制写入")
                    .isEmpty();
        }
    }

    /** 白名单只在列真的存在时才有意义，写错列名会让上面两条断言一起失效。 */
    @Test
    void theNotNullAllowlistMatchesRealColumns() {
        for (FullFormEntities.Entry entity : FullFormEntities.ALL) {
            Set<String> columns = tableInfo(entity.type()).getFieldList().stream()
                    .map(com.baomidou.mybatisplus.core.metadata.TableFieldInfo::getColumn)
                    .collect(java.util.stream.Collectors.toSet());

            assertThat(columns)
                    .as("%s 的 NOT NULL 白名单里有不存在的列名", entity.type().getSimpleName())
                    .containsAll(entity.notNullColumns());
        }
    }

    /** 单测里没有 MyBatis 启动过程，得自己把实体的元信息建出来。 */
    private TableInfo tableInfo(Class<?> entity) {
        return TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
    }
}
