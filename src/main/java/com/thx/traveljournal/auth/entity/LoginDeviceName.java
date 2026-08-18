package com.thx.traveljournal.auth.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 作者给某台登录设备起的名字。
 *
 * <p>不继承 BaseEntity：主键是浏览器那边的 {@code tj-device} Cookie 值，不是自增 id。
 * 名字挂在设备上而不是会话上——会话 30 天就过期，而「我给这台手机起过名」这件事
 * 应该活得比一次登录长。</p>
 */
@Data
@TableName("login_device")
public class LoginDeviceName {
    /** 对应浏览器里的 tj-device Cookie。 */
    @TableId
    private String deviceId;
    /** 归属账号，改名时用来确认这台设备是不是自己的。 */
    private String username;
    /** 作者起的名字，例如「我的 iPhone」。 */
    private String displayName;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
