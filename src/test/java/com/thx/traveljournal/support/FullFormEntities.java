package com.thx.traveljournal.support;

import com.thx.traveljournal.budget.entity.Expense;
import com.thx.traveljournal.itinerary.entity.ItineraryItem;
import com.thx.traveljournal.journaltemplate.entity.JournalTemplate;
import com.thx.traveljournal.trip.entity.TripStop;

import java.util.List;
import java.util.Set;

/**
 * 走「整表单提交 + {@code updateById}」的实体清单，以及它们在数据库里 NOT NULL 的列。
 *
 * <p>这份清单有两个使用者，缺一不可：</p>
 * <ul>
 *   <li>{@code NullableUpdateStrategyTest} 不需要数据库，随时能跑，守的是
 *       「可空字段必须能被清空」；</li>
 *   <li>{@code FlywayMigrationTest} 拿真实 schema 反过来校对这份白名单——白名单要是
 *       把一个其实可空的列写成了 NOT NULL，上面那条规则就对它悄悄失效了。</li>
 * </ul>
 *
 * <p>不包括 JournalEntry：日记的写入走字段级 UPDATE + 乐观锁，不经过 updateById。</p>
 */
public final class FullFormEntities {
    private FullFormEntities() {}

    /**
     * @param table          数据库表名
     * @param notNullColumns 该表 NOT NULL 的列名（不含审计列）
     */
    public record Entry(Class<?> type, String table, Set<String> notNullColumns) {}

    /** 审计列由 MetaObjectHandler 自动填，和表单无关，两边都不参与判定。 */
    public static final Set<String> AUDIT_COLUMNS = Set.of("created_at", "updated_at");

    public static final List<Entry> ALL = List.of(
            new Entry(TripStop.class, "trip_stop", Set.of(
                    "trip_id", "city_name", "country_name", "latitude", "longitude",
                    "coordinate_system", "location_source", "sort_order")),
            new Entry(ItineraryItem.class, "itinerary_item", Set.of(
                    "trip_id", "item_date", "type", "title", "completed", "sort_order")),
            new Entry(Expense.class, "expense", Set.of(
                    "trip_id", "budget_category_id", "expense_date", "amount", "description")),
            new Entry(JournalTemplate.class, "journal_template", Set.of(
                    "name", "category", "definition_json", "version", "enabled", "builtin")));
}
