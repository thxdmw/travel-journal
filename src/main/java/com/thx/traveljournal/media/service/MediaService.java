package com.thx.traveljournal.media.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.config.AppProperties;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.media.entity.JournalMedia;
import com.thx.traveljournal.media.entity.MediaAsset;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.media.mapper.MediaAssetMapper;
import com.thx.traveljournal.media.mapper.MediaVisibilityMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.mapper.TripMapper;
import io.minio.*;
import io.minio.Http;
import lombok.RequiredArgsConstructor;
import net.coobird.thumbnailator.Thumbnails;
import org.apache.tika.Tika;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.*;
import java.net.URI;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class MediaService {
    private static final List<String> ALLOWED = List.of("image/jpeg", "image/png", "image/webp");
    private final MediaAssetMapper assetMapper;
    private final JournalMediaMapper journalMediaMapper;
    private final MediaVisibilityMapper visibilityMapper;
    private final JournalMapper journalMapper;
    private final TripMapper tripMapper;
    private final MinioClient minioClient;
    private final AppProperties properties;
    private final Tika tika = new Tika();

    public record MediaView(Long relationId, Long id, String filename, String contentType,
                            Integer width, Integer height, String caption, Integer sortOrder,
                            String thumbnailUrl, String displayUrl) {}

    public List<MediaView> list(Long journalId) {
        requireJournal(journalId);
        return journalMediaMapper.selectList(new LambdaQueryWrapper<JournalMedia>()
                        .eq(JournalMedia::getJournalEntryId, journalId)
                        .orderByAsc(JournalMedia::getSortOrder, JournalMedia::getId))
                .stream().map(this::toView).toList();
    }

    @Transactional
    public MediaView upload(Long journalId, MultipartFile file, String caption) {
        JournalEntry journal = requireJournal(journalId);
        long count = journalMediaMapper.selectCount(new LambdaQueryWrapper<JournalMedia>()
                .eq(JournalMedia::getJournalEntryId, journalId));
        if (count >= properties.upload().maxImagesPerJournal()) throw BusinessException.badRequest("单篇日记图片数量已达上限");
        byte[] uploaded;
        try { uploaded = file.getBytes(); }
        catch (IOException ex) { throw new BusinessException("FILE_READ_ERROR", "读取上传文件失败", HttpStatus.BAD_REQUEST); }
        if (uploaded.length == 0 || uploaded.length > properties.upload().maxFileSizeMb() * 1024 * 1024) {
            throw BusinessException.badRequest("图片为空或超过大小限制");
        }

        String mime;
        BufferedImage source;
        try {
            mime = tika.detect(uploaded, file.getOriginalFilename());
            if (!ALLOWED.contains(mime)) throw BusinessException.badRequest("只支持 JPEG、PNG 和 WebP 图片");
            source = ImageIO.read(new ByteArrayInputStream(uploaded));
            if (source == null) throw BusinessException.badRequest("图片内容无法解码");
        } catch (IOException ex) {
            throw BusinessException.badRequest("图片内容无法识别");
        }
        long pixels = (long) source.getWidth() * source.getHeight();
        if (pixels > properties.upload().maxPixels()) throw BusinessException.badRequest("图片像素超过限制");

        int orientation = readOrientation(uploaded);
        BufferedImage normalized = orient(source, orientation);
        String originalFormat = switch (mime) {
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            default -> "webp";
        };
        byte[] original = encode(normalized, originalFormat);
        byte[] display = resize(normalized, 1280);
        byte[] thumbnail = resize(normalized, 480);

        String uuid = UUID.randomUUID().toString();
        String prefix = "trips/" + journal.getTripId() + "/journals/" + journalId + "/" + uuid + "/";
        String originalKey = prefix + "original." + originalFormat;
        String displayKey = prefix + "display.webp";
        String thumbnailKey = prefix + "thumbnail.webp";
        String bucket = properties.minio().bucket();
        try {
            put(bucket, originalKey, original, mime);
            put(bucket, displayKey, display, "image/webp");
            put(bucket, thumbnailKey, thumbnail, "image/webp");
        } catch (Exception ex) {
            cleanup(bucket, originalKey, displayKey, thumbnailKey);
            throw new BusinessException("STORAGE_ERROR", "图片上传到对象存储失败", HttpStatus.BAD_GATEWAY);
        }

        try {
            MediaAsset asset = new MediaAsset();
            asset.setBucketName(bucket);
            asset.setOriginalObjectKey(originalKey);
            asset.setDisplayObjectKey(displayKey);
            asset.setThumbnailObjectKey(thumbnailKey);
            asset.setOriginalFilename(safeFilename(file.getOriginalFilename()));
            asset.setContentType(mime);
            asset.setFileSize((long) original.length);
            asset.setWidth(normalized.getWidth());
            asset.setHeight(normalized.getHeight());
            asset.setChecksumSha256(sha256(original));
            assetMapper.insert(asset);

            JournalMedia relation = new JournalMedia();
            relation.setJournalEntryId(journalId);
            relation.setMediaAssetId(asset.getId());
            relation.setCaption(caption);
            relation.setSortOrder((int) count);
            journalMediaMapper.insert(relation);
            return toView(relation);
        } catch (RuntimeException ex) {
            cleanup(bucket, originalKey, displayKey, thumbnailKey);
            throw ex;
        }
    }

    public JournalMedia updateCaption(Long relationId, String caption) {
        JournalMedia relation = requireRelation(relationId);
        relation.setCaption(caption);
        journalMediaMapper.updateById(relation);
        return relation;
    }

    @Transactional
    public void reorder(Long journalId, List<Long> relationIds) {
        List<JournalMedia> current = journalMediaMapper.selectList(new LambdaQueryWrapper<JournalMedia>()
                .eq(JournalMedia::getJournalEntryId, journalId));
        if (current.size() != relationIds.size() ||
                !current.stream().map(JournalMedia::getId).collect(java.util.stream.Collectors.toSet()).equals(java.util.Set.copyOf(relationIds))) {
            throw BusinessException.badRequest("排序列表必须包含该日记的全部图片");
        }
        for (int i = 0; i < relationIds.size(); i++) {
            JournalMedia relation = requireRelation(relationIds.get(i));
            relation.setSortOrder(i);
            journalMediaMapper.updateById(relation);
        }
    }

    public void setCover(Long journalId, Long mediaId) {
        JournalEntry journal = requireJournal(journalId);
        long count = journalMediaMapper.selectCount(new LambdaQueryWrapper<JournalMedia>()
                .eq(JournalMedia::getJournalEntryId, journalId).eq(JournalMedia::getMediaAssetId, mediaId));
        if (count == 0) throw BusinessException.badRequest("图片不属于当前日记");
        journal.setCoverMediaId(mediaId);
        journalMapper.updateById(journal);
    }

    @Transactional
    public void deleteRelation(Long relationId) {
        JournalMedia relation = requireRelation(relationId);
        MediaAsset asset = requireAsset(relation.getMediaAssetId());
        JournalEntry journal = requireJournal(relation.getJournalEntryId());
        String marker = "/api/media/" + asset.getId() + "/";
        if (journal.getContentMarkdown() != null && journal.getContentMarkdown().contains(marker)) {
            throw BusinessException.conflict("正文仍引用该图片，请先从正文移除");
        }
        if (asset.getId().equals(journal.getCoverMediaId())) throw BusinessException.conflict("该图片仍是日记封面");
        long tripCovers = tripMapper.selectCount(new LambdaQueryWrapper<Trip>().eq(Trip::getCoverMediaId, asset.getId()));
        if (tripCovers > 0) throw BusinessException.conflict("该图片仍是旅行封面");
        try {
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(asset.getBucketName()).object(asset.getOriginalObjectKey()).build());
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(asset.getBucketName()).object(asset.getDisplayObjectKey()).build());
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(asset.getBucketName()).object(asset.getThumbnailObjectKey()).build());
        } catch (Exception ex) {
            throw new BusinessException("STORAGE_ERROR", "删除对象存储图片失败", HttpStatus.BAD_GATEWAY);
        }
        journalMediaMapper.deleteById(relationId);
        assetMapper.deleteById(asset.getId());
    }

    public URI access(Long mediaId, String variant, boolean admin) {
        MediaAsset asset = requireAsset(mediaId);
        if (!admin && visibilityMapper.countPublishedReferences(mediaId) == 0) {
            throw new BusinessException("FORBIDDEN", "图片不可公开访问", HttpStatus.FORBIDDEN);
        }
        String key = switch (variant) {
            case "thumbnail" -> asset.getThumbnailObjectKey();
            case "display" -> asset.getDisplayObjectKey();
            case "original" -> {
                if (!admin) throw new BusinessException("FORBIDDEN", "原图仅管理员可访问", HttpStatus.FORBIDDEN);
                yield asset.getOriginalObjectKey();
            }
            default -> throw BusinessException.notFound("图片规格不存在");
        };
        try {
            String url = minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Http.Method.GET).bucket(asset.getBucketName()).object(key)
                    .expiry(properties.minio().presignedUrlTtlMinutes(), TimeUnit.MINUTES).build());
            return URI.create(url);
        } catch (Exception ex) {
            throw new BusinessException("STORAGE_ERROR", "生成图片访问地址失败", HttpStatus.BAD_GATEWAY);
        }
    }

    private MediaView toView(JournalMedia relation) {
        MediaAsset asset = requireAsset(relation.getMediaAssetId());
        return new MediaView(relation.getId(), asset.getId(), asset.getOriginalFilename(), asset.getContentType(),
                asset.getWidth(), asset.getHeight(), relation.getCaption(), relation.getSortOrder(),
                "/api/media/" + asset.getId() + "/thumbnail", "/api/media/" + asset.getId() + "/display");
    }
    private JournalEntry requireJournal(Long id) {
        JournalEntry journal = journalMapper.selectById(id);
        if (journal == null) throw BusinessException.notFound("日记不存在");
        return journal;
    }
    private JournalMedia requireRelation(Long id) {
        JournalMedia relation = journalMediaMapper.selectById(id);
        if (relation == null) throw BusinessException.notFound("日记图片不存在");
        return relation;
    }
    private MediaAsset requireAsset(Long id) {
        MediaAsset asset = assetMapper.selectById(id);
        if (asset == null) throw BusinessException.notFound("图片不存在");
        return asset;
    }
    private void put(String bucket, String key, byte[] bytes, String contentType) throws Exception {
        minioClient.putObject(PutObjectArgs.builder().bucket(bucket).object(key)
                .stream(new ByteArrayInputStream(bytes), (long) bytes.length, -1L).contentType(contentType).build());
    }
    private void cleanup(String bucket, String... keys) {
        for (String key : keys) {
            try { minioClient.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build()); }
            catch (Exception ignored) { }
        }
    }
    private byte[] resize(BufferedImage source, int maxSize) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            Thumbnails.of(source).size(maxSize, maxSize).outputFormat("webp").outputQuality(0.86).toOutputStream(output);
            return output.toByteArray();
        } catch (IOException ex) {
            throw new BusinessException("IMAGE_PROCESS_ERROR", "生成图片尺寸失败", HttpStatus.BAD_REQUEST);
        }
    }
    private byte[] encode(BufferedImage image, String format) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!ImageIO.write(image, format, output)) throw new IOException("缺少图片编码器: " + format);
            return output.toByteArray();
        } catch (IOException ex) {
            throw new BusinessException("IMAGE_PROCESS_ERROR", "图片重新编码失败", HttpStatus.BAD_REQUEST);
        }
    }
    private int readOrientation(byte[] bytes) {
        try {
            var metadata = ImageMetadataReader.readMetadata(new ByteArrayInputStream(bytes));
            ExifIFD0Directory directory = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            return directory == null ? 1 : directory.getInt(ExifIFD0Directory.TAG_ORIENTATION);
        } catch (Exception ignored) { return 1; }
    }
    private BufferedImage orient(BufferedImage source, int orientation) {
        int width = source.getWidth(), height = source.getHeight();
        boolean swap = orientation >= 5 && orientation <= 8;
        BufferedImage target = new BufferedImage(swap ? height : width, swap ? width : height,
                source.getColorModel().hasAlpha() ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = target.createGraphics();
        AffineTransform tx = new AffineTransform();
        switch (orientation) {
            case 2 -> { tx.translate(width, 0); tx.scale(-1, 1); }
            case 3 -> { tx.translate(width, height); tx.rotate(Math.PI); }
            case 4 -> { tx.translate(0, height); tx.scale(1, -1); }
            case 5 -> { tx.rotate(Math.PI / 2); tx.scale(1, -1); }
            case 6 -> { tx.translate(height, 0); tx.rotate(Math.PI / 2); }
            case 7 -> { tx.translate(height, 0); tx.rotate(Math.PI / 2); tx.scale(-1, 1); }
            case 8 -> { tx.translate(0, width); tx.rotate(-Math.PI / 2); }
            default -> { }
        }
        g.drawImage(source, tx, null);
        g.dispose();
        return target;
    }
    private String safeFilename(String name) {
        if (name == null) return "image";
        String value = name.replace("\\", "/");
        value = value.substring(value.lastIndexOf('/') + 1).replaceAll("[\\r\\n]", "");
        return value.length() > 255 ? value.substring(value.length() - 255) : value;
    }
    private String sha256(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (Exception ex) { throw new IllegalStateException(ex); }
    }
}
