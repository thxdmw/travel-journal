package com.thx.traveljournal.media.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

/**
 * 图片引用的生命周期：谁有资格解除一条引用，谁只能回收。
 *
 * <p>同一张 {@code media_asset} 可以同时挂在多个位置——把随手记整理成日记之后，
 * 那张照片会同时被 {@code moment_media} 和 {@code journal_media} 引用，还可能正好是
 * 这篇日记的封面。这类共享是设计允许的，于是「删掉其中一处」绝不能波及其余各处。</p>
 *
 * <p>这里守的就是那条线：</p>
 * <ul>
 *   <li>回收（GC）只统计引用，永远不修改任何业务引用；</li>
 *   <li>解除引用由发起方负责，且只解除它自己那一条；</li>
 *   <li>顺带清掉的封面走日记自己的 revision 链路，不绕过乐观锁。</li>
 * </ul>
 */
class MediaReferenceLifecycleTest {
    private MediaAssetMapper assetMapper;
    private JournalMediaMapper relationMapper;
    private JournalMapper journalMapper;
    private TripMapper tripMapper;
    private MediaVisibilityMapper visibilityMapper;
    private MediaService service;
    private JournalEntry journal;

    @BeforeEach
    void setUp() {
        assetMapper = mock(MediaAssetMapper.class);
        relationMapper = mock(JournalMediaMapper.class);
        journalMapper = mock(JournalMapper.class);
        tripMapper = mock(TripMapper.class);
        visibilityMapper = mock(MediaVisibilityMapper.class);
        // LambdaUpdateWrapper 要靠 TableInfo 才能把方法引用翻译成列名，单测里没有 MyBatis 启动过程
        initTableInfo(JournalEntry.class);
        initTableInfo(Trip.class);
        journal = new JournalEntry();
        journal.setId(3L);
        journal.setRevision(7);
        journal.setContentJson(new JournalDocumentService(new ObjectMapper()).emptyDocument());
        when(journalMapper.selectById(3L)).thenReturn(journal);
        when(journalMapper.selectOne(any())).thenReturn(journal);
        when(journalMapper.update(any(), any())).thenReturn(1);
        when(assetMapper.selectById(20L)).thenReturn(asset(20L));
        AppProperties properties = new AppProperties("http://localhost",
                new AppProperties.Admin("admin", "password", "旅行者"),
                new AppProperties.Upload(20, 50, 50_000_000),
                new AppProperties.Minio("http://localhost:9000", "key", "secret", "travel-journal", 60));
        MediaService[] holder = new MediaService[1];
        holder[0] = new MediaService(assetMapper, relationMapper, visibilityMapper, journalMapper,
                new JournalDocumentService(new ObjectMapper()), tripMapper, mock(TripStopMapper.class),
                mock(MinioClient.class), properties, SelfProviders.of(holder), new SiteClock(properties));
        service = holder[0];
    }

    private void initTableInfo(Class<?> entity) {
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                new org.apache.ibatis.builder.MapperBuilderAssistant(
                        new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""),
                entity);
    }

    private JournalMedia relation(long id, long assetId) {
        JournalMedia relation = new JournalMedia();
        relation.setId(id);
        relation.setJournalEntryId(3L);
        relation.setMediaAssetId(assetId);
        relation.setSortOrder(0);
        return relation;
    }

    private MediaAsset asset(long id) {
        MediaAsset asset = new MediaAsset();
        asset.setId(id);
        asset.setBucketName("travel-journal");
        asset.setDisplayObjectKey("journals/3/x/display.webp");
        return asset;
    }

    /** 让这张图看起来还被别处引用着（随手记、别的日记……），GC 应当放过它。 */
    private void stillReferencedElsewhere() {
        when(relationMapper.selectCount(any())).thenReturn(1L);
    }

    /** 让这张图看起来已经没人要了。 */
    private void referencedByNobody() {
        when(relationMapper.selectCount(any())).thenReturn(0L);
        when(tripMapper.selectCount(any())).thenReturn(0L);
        when(assetMapper.selectById(anyLong())).thenReturn(asset(20L));
    }

    /*
     * ============================================================ 回收只回收
     */

    @Test
    void releasingASharedAssetLeavesEveryCoverAlone() {
        /*
         * 本轮修掉的那个 bug。
         *
         * 随手记 M 和日记 J 引用同一张照片 100，J 还把它设成了封面。用户从随手记里删掉
         * 这张照片时，旧实现会先把所有 cover_media_id = 100 的日记、旅行封面统统置空，
         * 然后才发现日记还引用着它、于是图片保留——最后照片还在、正文还在、日记也还引用它，
         * 只有封面凭空消失，而且没走 revision 链路，前端连感知的机会都没有。
         */
        stillReferencedElsewhere();

        service.releaseIfUnreferenced(List.of(100L));

        verify(journalMapper, never()).update(any(), any());
        verify(tripMapper, never()).update(any(), any());
        verify(assetMapper, never()).deleteById(anyLong());
    }

    @Test
    void releasingAnUnreferencedAssetStillCollectsIt() {
        // 放过共享图片不等于放过所有图片：真没人要的那张仍然要连记录一起清掉
        referencedByNobody();

        service.releaseIfUnreferenced(List.of(20L));

        verify(assetMapper).deleteById(20L);
        // 即便这时删得掉，也轮不到 GC 去改别人的封面字段
        verify(journalMapper, never()).update(any(), any());
        verify(tripMapper, never()).update(any(), any());
    }

    /*
     * ============================================================ 删单张图
     */

    @Test
    void deletingANonCoverImageDoesNotTouchTheCover() {
        journal.setCoverMediaId(99L);
        when(relationMapper.selectById(8L)).thenReturn(relation(8L, 20L));
        stillReferencedElsewhere();

        int revision = service.deleteRelation(8L);

        verify(relationMapper).deleteById(8L);
        verify(journalMapper, never()).update(any(), any());
        // 什么都没改，版本号原样返回，前端不必做任何调整
        assertThat(revision).isEqualTo(7);
    }

    @Test
    void deletingTheCoverImageClearsItAndAdvancesTheRevision() {
        journal.setCoverMediaId(20L);
        when(relationMapper.selectById(8L)).thenReturn(relation(8L, 20L));
        stillReferencedElsewhere();

        int revision = service.deleteRelation(8L);

        /*
         * 封面是这篇日记的一次改动，和设封面完全对称：推进 revision，并把新版本号回给调用方。
         * 不推进的话，另一个标签页拿着删图之前的版本号保存，会把已经失效的封面 id 写回来，
         * 而乐观锁看不出任何异常。
         */
        assertThat(revision).isEqualTo(8);
        ArgumentCaptor<Wrapper<JournalEntry>> captor = ArgumentCaptor.forClass(Wrapper.class);
        verify(journalMapper).update(isNull(), captor.capture());
        LambdaUpdateWrapper<JournalEntry> wrapper = (LambdaUpdateWrapper<JournalEntry>) captor.getValue();
        assertThat(wrapper.getSqlSet()).contains("revision = revision + 1");
        // 字段级 UPDATE，绝不能把读到的整行写回去
        verify(journalMapper, never()).updateById(any(JournalEntry.class));
        // 别人的封面依旧与它无关
        verify(tripMapper, never()).update(any(), any());
    }

    @Test
    void deletingAnImageNeverClearsAnotherJournalsCover() {
        /*
         * 同一张图片可以挂在多篇日记下（挂已有图片是允许的）。从 A 删掉它时，
         * B 的封面必须原封不动——旧实现是一条 `cover_media_id IN (...)` 的全局 UPDATE，
         * 一次删图能把所有引用同一张图的封面全部清空。
         */
        journal.setCoverMediaId(null);
        when(relationMapper.selectById(8L)).thenReturn(relation(8L, 20L));
        stillReferencedElsewhere();

        service.deleteRelation(8L);

        verify(journalMapper, never()).update(any(), any());
    }

    /*
     * ============================================================ 整篇删除
     */

    @Test
    void purgingAJournalDoesNotDetachOtherOwnersCovers() {
        /*
         * 整篇日记马上要没了，它自己的 cover_media_id 随行消失；真被删掉的图片，
         * 外键的 on delete set null 会替我们收尾。轮不到这里去动旅行封面。
         */
        when(relationMapper.selectList(any())).thenReturn(List.of(relation(8L, 20L)));
        stillReferencedElsewhere();

        int removed = service.purgeJournalMedia(3L);

        assertThat(removed).isEqualTo(1);
        verify(relationMapper).delete(any());
        verify(tripMapper, never()).update(any(), any());
        verify(journalMapper, never()).update(any(), any());
    }

    @Test
    void purgingAJournalKeepsPhotosThatTheMomentStillOwns() {
        /*
         * 整理成日记之后照片被两边同时引用。删掉日记时 journal_media 已经清空了，
         * 唯一还拦着它的就是随手记——那是当时按下快门的那一张，不能跟着日记走。
         */
        when(relationMapper.selectList(any())).thenReturn(List.of(relation(8L, 20L)));
        when(relationMapper.selectCount(any())).thenReturn(0L);
        when(tripMapper.selectCount(any())).thenReturn(0L);
        when(visibilityMapper.countMomentReferences(20L)).thenReturn(1L);
        when(assetMapper.selectById(20L)).thenReturn(asset(20L));

        service.purgeJournalMedia(3L);

        verify(assetMapper, never()).deleteById(anyLong());
    }
}
