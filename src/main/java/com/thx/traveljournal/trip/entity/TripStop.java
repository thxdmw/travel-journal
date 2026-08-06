package com.thx.traveljournal.trip.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("trip_stop")
public class TripStop extends BaseEntity {
    private Long tripId;
    private String cityName;
    private String regionName;
    private String countryName;
    private String countryCode;
    private BigDecimal latitude;
    private BigDecimal longitude;
    private String placeId;
    private String formattedAddress;
    private String adcode;
    private String coordinateSystem;
    private String locationSource;
    private LocalDate arrivalDate;
    private LocalDate departureDate;
    private Integer sortOrder;
    private String note;
}
