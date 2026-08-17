package com.thx.traveljournal.media.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.common.util.SiteClock;
import com.thx.traveljournal.config.AppProperties;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.journal.service.JournalDocumentService;
import com.thx.traveljournal.media.entity.JournalMedia;
import com.thx.traveljournal.media.entity.MediaAsset;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.media.mapper.MediaAssetMapper;
import com.thx.traveljournal.media.mapper.MediaVisibilityMapper;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

/**
 * journal_media 这张聚合表的一致性。
 *
 * <p>五条路径都会「读一遍现有集合，再写回去」——上传、挂已有图片、删除、手工重排、
 * 按拍摄时间重排。它们全都要在同一把日记行锁下串行，否则两条同时跑就互相覆盖。
 * 序号分配尤其容易写错：用条数当下一个序号，删过图之后必然撞车。</p>
 */
class JournalMediaConsistencyTest {
    private MediaAssetMapper assetMapper;
    private JournalMediaMapper relationMapper;
    private JournalMapper journalMapper;
    private MediaService service;
    private JournalEntry journal;

    @BeforeEach
    void setUp() {
        assetMapper = mock(MediaAssetMapper.class);
        relationMapper = mock(JournalMediaMapper.class);
        journalMapper = mock(JournalMapper.class);
        // LambdaUpdateWrapper 要靠 TableInfo 才能把方法引用翻译成列名，单测里没有 MyBatis 启动过程
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                new org.apache.ibatis.builder.MapperBuilderAssistant(
                        new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""),
                JournalEntry.class);
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                new org.apache.ibatis.builder.MapperBuilderAssistant(
                        new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""),
                com.thx.traveljournal.trip.entity.Trip.class);
        journal = new JournalEntry();
        journal.setId(3L);
        journal.setContentJson(new JournalDocumentService(new ObjectMapper()).emptyDocument());
        when(journalMapper.selectById(3L)).thenReturn(journal);
        when(journalMapper.selectOne(any())).thenReturn(journal);
        AppProperties properties = new AppProperties("http://localhost",
                new AppProperties.Admin("admin", "password", "旅行者"),
                new AppProperties.Upload(20, 50, 50_000_000),
                new AppProperties.Minio("http://localhost:9000", "key", "secret", "travel-journal", 60));
        MediaService[] holder = new MediaService[1];
        holder[0] = new MediaService(assetMapper, relationMapper, mock(MediaVisibilityMapper.class), journalMapper,
                new JournalDocumentService(new ObjectMapper()), mock(TripMapper.class), mock(TripStopMapper.class),
                mock(MinioClient.class), properties, SelfProviders.of(holder), new SiteClock(properties));
        service = holder[0];
    }

    private JournalMedia relation(long id, long assetId, int sortOrder) {
        JournalMedia relation = new JournalMedia();
        relation.setId(id);
        relation.setJournalEntryId(3L);
        relation.setMediaAssetId(assetId);
        relation.setSortOrder(sortOrder);
        return relation;
    }

    private MediaAsset asset(long id) {
        MediaAsset asset = new MediaAsset();
        asset.setId(id);
        asset.setBucketName("travel-journal");
        asset.setDisplayObjectKey("journals/3/x/display.webp");
        return asset;
    }

    /*
     * ============================================================ 序号分配
     */

    @Test
    void nextSortOrderSkipsGapsLeftByDeletion() {
        // [0,1,2] 里删掉中间那张，剩下 [0,2]：条数是 2，最大序号也是 2
        when(relationMapper.selectList(any())).thenReturn(List.of(relation(1L, 11L, 0), relation(3L, 13L, 2)));
        when(assetMapper.selectById(20L)).thenReturn(asset(20L));
        List<JournalMedia> inserted = new ArrayList<>();
        when(relationMapper.insert(any(JournalMedia.class))).thenAnswer(invocation -> {
            inserted.add(invocation.getArgument(0));
            return 1;
        });
        when(relationMapper.selectOne(any())).thenReturn(null);

        service.attachExisting(3L, 20L, null);

        // 用条数会得到 2，和现有那张撞车；必须是 max+1
        assertThat(inserted).hasSize(1);
        assertThat(inserted.get(0).getSortOrder()).isEqualTo(3);
    }

    @Test
    void firstImageStartsAtZero() {
        when(relationMapper.selectList(any())).thenReturn(List.of());
        when(assetMapper.selectById(20L)).thenReturn(asset(20L));
        when(relationMapper.selectOne(any())).thenReturn(null);
        List<JournalMedia> inserted = new ArrayList<>();
        when(relationMapper.insert(any(JournalMedia.class))).thenAnswer(invocation -> {
            inserted.add(invocation.getArgument(0));
            return 1;
        });

        service.attachExisting(3L, 20L, null);

        assertThat(inserted.get(0).getSortOrder()).isZero();
    }

    @Test
    void uploadLimitCountsExistingRelations() {
        List<JournalMedia> full = new ArrayList<>();
        for (int i = 0; i < 50; i++) full.add(relation(i + 1L, 100L + i, i));
        when(relationMapper.selectList(any())).thenReturn(full);
        when(assetMapper.selectById(20L)).thenReturn(asset(20L));
        when(relationMapper.selectOne(any())).thenReturn(null);

        assertThatThrownBy(() -> service.attachExisting(3L, 20L, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("数量已达上限");
    }

    /*
     * ============================================================ 并发挂载
     */

    @Test
    void attachingTheSameAssetTwiceReusesTheExistingRelation() {
        // 第二个请求进来时，第一个已经插好了
        when(relationMapper.selectOne(any())).thenReturn(relation(8L, 20L, 0));
        when(assetMapper.selectById(20L)).thenReturn(asset(20L));

        MediaService.MediaView view = service.attachExisting(3L, 20L, null);

        assertThat(view.relationId()).isEqualTo(8L);
        verify(relationMapper, never()).insert(any(JournalMedia.class));
    }

    @Test
    void uniqueConstraintViolationStillReturnsANormalResult() {
        /*
         * 有人绕过了行锁（另一个进程直连数据库）。唯一约束挡住了重复插入，这时该把
         * 已经存在的那条关系返回给调用方，而不是把 500 抛出去——两个并发请求都应该
         * 得到「这张图已经挂在这篇日记上」这个正确结果。
         */
        when(relationMapper.selectOne(any())).thenReturn(null, relation(8L, 20L, 0));
        when(relationMapper.selectList(any())).thenReturn(List.of());
        when(assetMapper.selectById(20L)).thenReturn(asset(20L));
        when(relationMapper.insert(any(JournalMedia.class)))
                .thenThrow(new DuplicateKeyException("uk_journal_media_entry_asset"));

        MediaService.MediaView view = service.attachExisting(3L, 20L, null);

        assertThat(view.relationId()).isEqualTo(8L);
    }

    /*
     * ============================================================ 行锁覆盖面
     *
     * 少锁任何一条路径，它就能和别的写入交错。这里逐个确认都取了锁。
     */

    @Test
    void everyWritePathLocksTheJournalRow() {
        when(relationMapper.selectList(any())).thenReturn(List.of(relation(8L, 20L, 0)));
        when(relationMapper.selectById(8L)).thenReturn(relation(8L, 20L, 0));
        when(assetMapper.selectById(20L)).thenReturn(asset(20L));
        when(assetMapper.selectByIds(any())).thenReturn(List.of(asset(20L)));
        when(relationMapper.selectOne(any())).thenReturn(relation(8L, 20L, 0));
        when(relationMapper.selectCount(any())).thenReturn(1L);

        service.reorder(3L, List.of(8L));
        service.sortByCaptureTime(3L);
        service.deleteRelation(8L);
        service.setCover(3L, 20L);
        service.purgeJournalMedia(3L);

        // 五条路径各锁一次；upload / attachExisting 由上面的用例覆盖
        verify(journalMapper, atLeast(5)).selectOne(any());
    }

    /*
     * ============================================================ 设封面
     *
     * 设封面是这篇日记的一次写入，必须和正文保存走同一套并发协议。
     */

    @Test
    void settingCoverDoesNotWriteBackTheWholeRowItRead() {
        /*
         * 「读出整行 → 改一个字段 → updateById」会把读到那一刻的 title、content_json
         * 和 revision 一起写回去。中间只要有一次自动保存成功，刚写的正文就没了。
         * 所以只能发字段级 UPDATE，绝不能碰 updateById。
         */
        when(relationMapper.selectCount(any())).thenReturn(1L);

        service.setCover(3L, 20L);

        verify(journalMapper, never()).updateById(any(JournalEntry.class));
        verify(journalMapper).update(isNull(), any());
    }

    @Test
    void settingCoverRejectsAnImageFromAnotherJournal() {
        when(relationMapper.selectCount(any())).thenReturn(0L);

        assertThatThrownBy(() -> service.setCover(3L, 99L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不属于当前日记");
        verify(journalMapper, never()).update(any(), any());
    }
}
