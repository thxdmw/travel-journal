-- 一篇日记里同一张图片只能有一条引用关系。
--
-- attachExisting 的逻辑是「先查有没有，没有就插一条」。随手记整理成日记时会成批调它，
-- 两个请求同时进来都查不到、于是都插入，同一张照片在日记里出现两次——而且两条关系的
-- sortOrder 不同，作者删掉一条另一条还在。这种约束只能由数据库来保证，应用层的
-- check-then-act 无论怎么写都有窗口。
--
-- 先清掉可能已经存在的重复：保留 id 最小的那条（最早建立的引用，sortOrder 也更靠前）。

delete from journal_media
 where id not in (
     select min(id)
       from journal_media
      group by journal_entry_id, media_asset_id
 );

alter table journal_media
    add constraint uk_journal_media_entry_asset unique (journal_entry_id, media_asset_id);

comment on constraint uk_journal_media_entry_asset on journal_media is
    '同一篇日记不能重复引用同一张图片；并发 attach 时由这条约束兜底，冲突方复用已存在的关系';
