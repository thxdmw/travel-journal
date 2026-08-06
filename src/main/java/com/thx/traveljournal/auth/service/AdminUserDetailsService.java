package com.thx.traveljournal.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.auth.mapper.AdminUserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/**
 * 给 Spring Security 提供账号信息。
 *
 * <p>用户不存在时的提示语和密码错误保持一致，不泄露某个用户名是否存在。</p>
 */
@Service
@RequiredArgsConstructor
public class AdminUserDetailsService implements UserDetailsService {
    private final AdminUserMapper mapper;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        AdminUser admin = mapper.selectOne(new LambdaQueryWrapper<AdminUser>()
                .eq(AdminUser::getUsername, username));
        if (admin == null) throw new UsernameNotFoundException("用户名或密码错误");
        return User.withUsername(admin.getUsername())
                .password(admin.getPasswordHash())
                .roles("ADMIN")
                .disabled(!Boolean.TRUE.equals(admin.getEnabled()))
                .build();
    }
}
