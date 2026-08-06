package com.thx.traveljournal.trip.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 旅行途经的城市或地点，同时提供前台地图上的坐标点。
 *
 * <p>对应数据库表 {@code trip_stop}，字段注释与库中的 COMMENT 保持一致。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("trip_stop")
public class TripStop extends BaseEntity {
    /** 所属旅行，旅行删除时级联删除 */
    private Long tripId;
    /** 城市或地点名称 */
    private String cityName;
    /** 省份或区域 */
    private String regionName;
    /** 国家名称 */
    private String countryName;
    /** ISO 两位大写国家代码，例如 CN */
    private String countryCode;
    /** 纬度，范围 -90 到 90，不能与经度同时为 0 */
    private BigDecimal latitude;
    /** 经度，范围 -180 到 180，不能与纬度同时为 0 */
    private BigDecimal longitude;
    /** 地图服务商返回的地点 id，用于二次检索 */
    private String placeId;
    /** 地图服务商返回的格式化详细地址 */
    private String formattedAddress;
    /** 行政区划代码，用于按地区聚合统计 */
    private String adcode;
    /** 坐标系：GCJ02 高德火星坐标、WGS84 国际标准坐标 */
    private String coordinateSystem;
    /** 坐标来源：AMAP_SEARCH 地点搜索、AMAP_REVERSE 逆地理编码、MAP_PICK 地图选点、MANUAL 手动填写 */
    private String locationSource;
    /** 到达日期 */
    private LocalDate arrivalDate;
    /** 离开日期，不得早于到达日期 */
    private LocalDate departureDate;
    /** 同一旅行内的排序号，从 0 开始 */
    private Integer sortOrder;
    /** 备注 */
    private String note;
}
