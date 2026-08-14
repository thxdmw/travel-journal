package com.thx.traveljournal.media.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.common.util.SiteClock;
import com.thx.traveljournal.config.AppProperties;
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
import io.minio.RemoveObjectArgs;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * 公开图片响应的隐私边界，以及草稿预览令牌的授权范围。
 *
 * <p>公开接口曾经直接复用后台的 MediaView，把原始文件名、EXIF 拍摄时间和 GPS 经纬度
 * 一起发给了访客——照片拍摄地点是隐私，不该因为「顺手复用一个 record」而流出去。</p>
 */
class MediaPrivacyTest {
    private MediaAssetMapper assetMapper;
    private JournalMediaMapper relationMapper;
    private MediaVisibilityMapper visibilityMapper;
    private MinioClient minio;
    private MediaService service;

    @BeforeEach
    void setUp() throws Exception {
        assetMapper = mock(MediaAssetMapper.class);
        relationMapper = mock(JournalMediaMapper.class);
        visibilityMapper = mock(MediaVisibilityMapper.class);
        minio = mock(MinioClient.class);
        when(minio.getPresignedObjectUrl(any())).thenReturn("http://localhost:9000/travel-journal/x?sig=1");
        // LambdaUpdateWrapper 要靠 TableInfo 才能把方法引用翻译成列名，单测里没有 MyBatis 启动过程
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                new org.apache.ibatis.builder.MapperBuilderAssistant(
                        new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""),
                com.thx.traveljournal.journal.entity.JournalEntry.class);
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                new org.apache.ibatis.builder.MapperBuilderAssistant(
                        new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""),
                com.thx.traveljournal.trip.entity.Trip.class);
        AppProperties properties = new AppProperties("http://localhost",
                new AppProperties.Admin("admin", "password", "旅行者"),
                new AppProperties.Upload(20, 50, 50_000_000),
                new AppProperties.Minio("http://localhost:9000", "key", "secret", "travel-journal", 60));
        service = new MediaService(assetMapper, relationMapper, visibilityMapper, mock(JournalMapper.class),
                new JournalDocumentService(new ObjectMapper()), mock(TripMapper.class), mock(TripStopMapper.class),
                minio, properties, new SiteClock(properties));
    }

    private MediaAsset asset() {
        MediaAsset asset = new MediaAsset();
        asset.setId(9L);
        asset.setBucketName("travel-journal");
        asset.setOriginalObjectKey("journals/3/x/original.jpg");
        asset.setDisplayObjectKey("journals/3/x/display.webp");
        asset.setMediumObjectKey("journals/3/x/medium.webp");
        asset.setThumbnailObjectKey("journals/3/x/thumbnail.webp");
        asset.setOriginalFilename("IMG_4821.HEIC");
        asset.setContentType("image/jpeg");
        asset.setWidth(4000);
        asset.setHeight(3000);
        asset.setCapturedAt(OffsetDateTime.parse("2026-08-01T09:30:00Z"));
        asset.setGpsLatitude(new BigDecimal("35.011600"));
        asset.setGpsLongitude(new BigDecimal("135.768100"));
        return asset;
    }

    private JournalMedia relation() {
        JournalMedia relation = new JournalMedia();
        relation.setId(8L);
        relation.setJournalEntryId(3L);
        relation.setMediaAssetId(9L);
        relation.setCaption("清晨的鸭川");
        relation.setSortOrder(0);
        return relation;
    }

    @Test
    void publicResponseCarriesNoExifOrInternalIdentifiers() throws Exception {
        when(relationMapper.selectList(any())).thenReturn(List.of(relation()));
        when(assetMapper.selectByIds(any())).thenReturn(List.of(asset()));

        List<MediaService.PublicMediaView> views = service.publicList(3L, null);
        String json = new ObjectMapper().writeValueAsString(views);

        assertThat(views).hasSize(1);
        assertThat(views.get(0).caption()).isEqualTo("清晨的鸭川");
        assertThat(views.get(0).displayUrl()).isEqualTo("/api/media/9/display");
        // 这些都是公开渲染用不上、泄露了却收不回来的东西
        assertThat(json).doesNotContain("IMG_4821")
                .doesNotContain("35.0116").doesNotContain("135.7681")
                .doesNotContain("2026-08-01T09:30")
                .doesNotContain("relationId")
                .doesNotContain("ObjectKey").doesNotContain("bucket");
    }

    @Test
    void previewTokenIsCarriedOnEveryImageUrl() {
        when(relationMapper.selectList(any())).thenReturn(List.of(relation()));
        when(assetMapper.selectByIds(any())).thenReturn(List.of(asset()));

        List<MediaService.PublicMediaView> views = service.publicList(3L, "tok en/1");

        // 令牌要 URL 编码，否则带斜杠或加号的令牌会把地址拼坏
        assertThat(views.get(0).thumbnailUrl()).isEqualTo("/api/media/9/thumbnail?previewToken=tok+en%2F1");
        assertThat(views.get(0).mediumUrl()).contains("?previewToken=");
    }

    @Test
    void previewTokenUnlocksItsOwnDraftImages() {
        when(assetMapper.selectById(9L)).thenReturn(asset());
        when(visibilityMapper.countPublishedReferences(9L)).thenReturn(0L);
        when(relationMapper.selectCount(any())).thenReturn(1L);

        assertThat(service.access(9L, "display", false, 3L)).isNotNull();
    }

    @Test
    void previewTokenCannotReachAnotherDraftsImages() {
        when(assetMapper.selectById(9L)).thenReturn(asset());
        when(visibilityMapper.countPublishedReferences(9L)).thenReturn(0L);
        // 这张图不属于令牌授权的那一篇
        when(relationMapper.selectCount(any())).thenReturn(0L);

        assertThatThrownBy(() -> service.access(9L, "display", false, 4L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不可公开访问");
    }

    @Test
    void previewTokenNeverUnlocksTheOriginal() {
        when(assetMapper.selectById(9L)).thenReturn(asset());
        when(relationMapper.selectCount(any())).thenReturn(1L);

        assertThatThrownBy(() -> service.access(9L, "original", false, 3L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("原图仅管理员");
    }

    @Test
    void anonymousStillCannotReachDraftImagesWithoutAToken() {
        when(assetMapper.selectById(9L)).thenReturn(asset());
        when(visibilityMapper.countPublishedReferences(9L)).thenReturn(0L);

        assertThatThrownBy(() -> service.access(9L, "display", false, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不可公开访问");
    }

    @Test
    void deletingAnOrphanRemovesAllFourVariants() throws Exception {
        when(relationMapper.selectById(8L)).thenReturn(relation());
        when(assetMapper.selectById(9L)).thenReturn(asset());
        com.thx.traveljournal.journal.entity.JournalEntry journal = new com.thx.traveljournal.journal.entity.JournalEntry();
        journal.setId(3L);
        journal.setContentJson(new JournalDocumentService(new ObjectMapper()).emptyDocument());
        MediaService withJournal = serviceWithJournal(journal);

        withJournal.deleteRelation(8L);

        ArgumentCaptor<RemoveObjectArgs> captor = ArgumentCaptor.forClass(RemoveObjectArgs.class);
        verify(minio, times(4)).removeObject(captor.capture());
        // medium 以前被漏掉了：每删一张图都会在桶里留下一个再也没人引用的文件
        assertThat(captor.getAllValues().stream().map(RemoveObjectArgs::object))
                .containsExactlyInAnyOrder("journals/3/x/original.jpg", "journals/3/x/display.webp",
                        "journals/3/x/medium.webp", "journals/3/x/thumbnail.webp");
    }

    private MediaService serviceWithJournal(com.thx.traveljournal.journal.entity.JournalEntry journal) {
        JournalMapper journalMapper = mock(JournalMapper.class);
        when(journalMapper.selectById(3L)).thenReturn(journal);
        AppProperties properties = new AppProperties("http://localhost",
                new AppProperties.Admin("admin", "password", "旅行者"),
                new AppProperties.Upload(20, 50, 50_000_000),
                new AppProperties.Minio("http://localhost:9000", "key", "secret", "travel-journal", 60));
        return new MediaService(assetMapper, relationMapper, visibilityMapper, journalMapper,
                new JournalDocumentService(new ObjectMapper()), mock(TripMapper.class), mock(TripStopMapper.class),
                minio, properties, new SiteClock(properties));
    }
}
