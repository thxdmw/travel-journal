package com.thx.traveljournal.auth.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.OffsetDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("admin_user")
public class AdminUser extends BaseEntity {
    private String username;
    private String passwordHash;
    private String displayName;
    private String avatarObjectKey;
    private String themeKey;
    private Boolean enabled;
    private OffsetDateTime lastLoginAt;
}
