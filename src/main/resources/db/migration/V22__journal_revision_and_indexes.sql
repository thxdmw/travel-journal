-- 日记草稿的乐观并发控制，以及几条按真实查询补的索引。
--
-- 自动保存会把整篇正文全量写上去。前端那条串行队列只管得住当前这个标签页：
-- 换一台设备、多开一个标签页，或者 pagehide 的 keepalive 请求和正在路上的自动保存
-- 撞在一起，晚到的旧正文就会盖掉新写的那一段。加一个版本号，让服务端能认出
-- 「你手上这份已经不是最新的了」，而不是默默接受覆盖。

alter table journal_entry
    add column revision integer not null default 0;

comment on column journal_entry.revision is
    '草稿保存的乐观锁版本号；每次成功写入自增 1，客户端提交时带上它，不匹配返回 409';

-- 后台日记列表按更新时间倒序翻页，空草稿清理按 status + updated_at 扫描，
-- 后台首页按状态计数。这三条查询共用一组索引。
create index if not exists idx_journal_entry_updated_at
    on journal_entry (updated_at desc);

create index if not exists idx_journal_entry_status_updated_at
    on journal_entry (status, updated_at);

-- 预览令牌按 token 精确查（已有唯一约束），过期清理按 expires_at 扫。
create index if not exists idx_journal_preview_token_expires_at
    on journal_preview_token (expires_at);
