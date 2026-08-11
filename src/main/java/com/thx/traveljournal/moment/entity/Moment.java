package com.thx.traveljournal.moment.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * 随手记：旅途中二十秒记完的一条。
 *
 * <p>和日记的区别不只是长短。日记是晚上坐下来写的那一篇，有标题、有结构、要发布；
 * 随手记是走在路上顺手按下的一句话加一张照片，它的价值在于「当时」——所以这里没有
 * 标题、没有状态，只有时间、一段话、几张照片和一个地点。</p>
 *
 * <p>对应数据库表 {@code moment}，字段注释与库中的 COMMENT 保持一致。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("moment")
public class Moment extends BaseEntity {
    /** 浏览器离线队列生成的幂等键；同一旅行内唯一。 */
    private String clientId;
    /** 所属旅行，旅行删除时级联删除 */
    private Long tripId;
    /** 所在城市，可为空 */
    private Long tripStopId;
    /** 这件事发生的时刻，不是写下的时刻——补记昨天的事很常见 */
    private OffsetDateTime occurredAt;
    /** 事情发生地的当地日期，按天分组与整理都以它为准。 */
    private LocalDate occurredLocalDate;
    /** 事情发生地的 IANA 时区。 */
    private String occurredZoneId;
    /** 当时相对 UTC 的分钟偏移，作为时区解析失败时的后备。 */
    private Integer utcOffsetMinutes;
    /** 正文，通常一两句话 */
    private String content;
    /** 地点名称，可以来自定位反查，也可以手填 */
    private String placeName;
    /** 纬度，来自设备定位或照片 EXIF */
    private BigDecimal latitude;
    /** 经度，来自设备定位或照片 EXIF */
    private BigDecimal longitude;
    /** 当时的心情，一个词 */
    private String mood;
    /** 已经被整理进哪篇日记；为空表示还散着 */
    private Long journalEntryId;
}
