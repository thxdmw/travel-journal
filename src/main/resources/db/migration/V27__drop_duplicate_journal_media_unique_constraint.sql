-- journal_media 上有两条一模一样的唯一约束，删掉其中一条。
--
-- V1 建表时就写了 uq_journal_media(journal_entry_id, media_asset_id)，V25 为了给并发
-- attachExisting 兜底又加了一条 uk_journal_media_entry_asset，两者覆盖的列完全相同。
-- PostgreSQL 允许这样，所以一直没报错，只是每条 INSERT / UPDATE 都白维护一次索引。
--
-- 保留 V25 那条：名字和 comment 说清楚了它是干什么的，应用层的重复 attach 也是按它
-- 的语义在处理冲突。

alter table journal_media
    drop constraint if exists uq_journal_media;
