-- 给登录设备起名字。
--
-- 「哪一台是我现在拿着的手机」这个问题，浏览器其实回答不了：作者自己给设备起的那个名字
-- （「我的 iPhone」）没有任何 Web API 拿得到，User-Agent 最多给到机型，iOS 连机型都不给。
-- 所以让作者自己命名，是唯一能真正认出来的办法。
--
-- 名字挂在 device_id 上而不是会话上：会话 30 天就过期了，重新登录会换一个新会话，
-- 而作者期望的是「我给这台手机起过名，它下次登录还叫这个名」。device_id 存活 400 天，
-- 正好是这个语义的载体。
--
-- 只存被改过名的设备。没改过的照旧走 User-Agent 识别，不为每次登录都写一行。

create table login_device (
    device_id    varchar(36)  primary key,
    username     varchar(64)  not null,
    display_name varchar(60)  not null,
    created_at   timestamptz  not null default now(),
    updated_at   timestamptz  not null default now()
);

create index idx_login_device_username on login_device (username);

comment on table login_device is '作者给登录设备起的自定义名称；只存改过名的设备，其余按 User-Agent 识别';
comment on column login_device.device_id is '对应浏览器里的 tj-device Cookie，比会话活得久';
comment on column login_device.username is '归属账号；改名只能改自己名下的设备';
comment on column login_device.display_name is '作者起的名字，例如「我的 iPhone」';
