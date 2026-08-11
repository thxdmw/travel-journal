package com.thx.traveljournal.media.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.thx.traveljournal.journal.service.JournalDocumentService;
import com.thx.traveljournal.config.AppProperties;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.media.entity.MediaAsset;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.media.mapper.MediaAssetMapper;
import com.thx.traveljournal.media.mapper.MediaVisibilityMapper;
import com.thx.traveljournal.trip.mapper.TripMapper;
import io.minio.MinioClient;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MediaServiceTest {
    @Test
    void shouldUploadAndReturnStableApplicationUrls() throws Exception {
        MediaAssetMapper assetMapper = mock(MediaAssetMapper.class);
        JournalMediaMapper relationMapper = mock(JournalMediaMapper.class);
        JournalMapper journalMapper = mock(JournalMapper.class);
        MinioClient minio = mock(MinioClient.class);

        JournalEntry journal = new JournalEntry();
        journal.setId(3L); journal.setTripId(null);
        when(journalMapper.selectById(3L)).thenReturn(journal);
        when(relationMapper.selectCount(any())).thenReturn(0L);

        AtomicReference<MediaAsset> stored = new AtomicReference<>();
        when(assetMapper.insert(any(MediaAsset.class))).thenAnswer(invocation -> {
            MediaAsset asset = invocation.getArgument(0);
            asset.setId(9L); stored.set(asset); return 1;
        });
        when(assetMapper.selectById(9L)).thenAnswer(invocation -> stored.get());
        when(relationMapper.insert(any(com.thx.traveljournal.media.entity.JournalMedia.class))).thenAnswer(invocation -> {
            com.thx.traveljournal.media.entity.JournalMedia relation = invocation.getArgument(0);
            relation.setId(8L); return 1;
        });

        AppProperties properties = new AppProperties("http://localhost",
                new AppProperties.Admin("admin", "password", "旅行者"),
                new AppProperties.Upload(20, 50, 50_000_000),
                new AppProperties.Minio("http://localhost:9000", "key", "secret", "travel-journal", 60));
        MediaService service = new MediaService(assetMapper, relationMapper, mock(MediaVisibilityMapper.class),
                journalMapper, new JournalDocumentService(new ObjectMapper()), mock(TripMapper.class),
                mock(com.thx.traveljournal.trip.mapper.TripStopMapper.class), minio, properties);

        BufferedImage image = new BufferedImage(20, 10, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "png", output);
        MockMultipartFile file = new MockMultipartFile("file", "photo.png", "image/png", output.toByteArray());

        MediaService.MediaView view = service.upload(3L, file, "测试图片");

        assertThat(view.id()).isEqualTo(9L);
        assertThat(view.displayUrl()).isEqualTo("/api/media/9/display");
        assertThat(view.mediumUrl()).isEqualTo("/api/media/9/medium");
        assertThat(view.thumbnailUrl()).isEqualTo("/api/media/9/thumbnail");
        assertThat(stored.get().getOriginalObjectKey()).startsWith("journals/3/");
        // 原图 + 1280 展示图 + 768 中等图 + 480 缩略图，共四个对象
        verify(minio, times(4)).putObject(any());
    }
}
