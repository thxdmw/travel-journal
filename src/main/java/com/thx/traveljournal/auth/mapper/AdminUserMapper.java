package com.thx.traveljournal.auth.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.auth.entity.AdminUser;
/**
 * 管理员账号，系统为单管理员设计，通常只有一行。
 *
 * <p>对应数据库表 {@code admin_user}，基础的增删改查由 MyBatis-Plus 的 BaseMapper 提供。</p>
 */
public interface AdminUserMapper extends BaseMapper<AdminUser> {}
