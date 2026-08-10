package com.thx.traveljournal.common.util;

import com.thx.traveljournal.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/**
 * 站点自己的时钟。
 *
 * <p>凡是要回答「今天是几号」「这条记录属于哪一天」的地方都走这里，而不是各自
 * {@code LocalDate.now()}。理由有两个：数据库里存的是 UTC 时间戳，直接按 UTC 切分
 * 会让晚上八点之后写的东西掉到第二天；而按访客设备的时区算，同一个站点在东京和悉尼
 * 又会显示成不同的季节。这是一个人的旅行站，应该只有一个「今天」。</p>
 *
 * <p>时区由 {@code app.site.timezone} 配置，默认 Asia/Shanghai。</p>
 */
@Slf4j
@Component
public class SiteClock {
    private final ZoneId zone;

    public SiteClock(AppProperties properties) {
        this.zone = resolve(properties);
    }

    public ZoneId zone() {
        return zone;
    }

    /** 站点时区下的今天。 */
    public LocalDate today() {
        return LocalDate.now(zone);
    }

    /** 一个时间戳落在站点时区的哪一天。 */
    public LocalDate dayOf(OffsetDateTime moment) {
        return moment == null ? null : moment.atZoneSameInstant(zone).toLocalDate();
    }

    /** 某一天在站点时区的起点，含。 */
    public OffsetDateTime startOfDay(LocalDate day) {
        return day.atStartOfDay(zone).toOffsetDateTime();
    }

    /** 某一天在站点时区的终点，不含——查询区间统一写成 [startOfDay, endOfDay)。 */
    public OffsetDateTime endOfDay(LocalDate day) {
        return startOfDay(day.plusDays(1));
    }

    /** 配置写错时退回上海，而不是让整个应用起不来——时区没重要到那个程度。 */
    private static ZoneId resolve(AppProperties properties) {
        String configured = properties == null || properties.site() == null
                ? null : properties.site().timezone();
        if (configured == null || configured.isBlank()) return ZoneId.of("Asia/Shanghai");
        try {
            return ZoneId.of(configured.trim());
        } catch (Exception e) {
            log.warn("app.site.timezone 配置的时区无法识别：{}，回落到 Asia/Shanghai", configured);
            return ZoneId.of("Asia/Shanghai");
        }
    }
}
