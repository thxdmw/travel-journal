package com.thx.traveljournal.media.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import com.thx.traveljournal.common.exception.BusinessException;
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
import io.minio.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * 媒体服务，负责图片的上传、转码、存储、访问授权和删除。
 *
 * <p>图片在系统中分成两层：{@code media_asset} 记录对象存储中的文件本身，
 * {@code journal_media} 记录「某篇日记引用了某张图片」这层关系。旅行封面和日记封面
 * 都只是保存了 {@code media_asset.id} 的引用字段，不额外建关系表。</p>
 *
 * <p>删除策略：图片被正文引用时拒绝删除（避免正文里留下坏图）；被设为日记封面或
 * 旅行封面时不再拒绝，改为自动清空对应的封面引用后再删。对象存储删除失败只记录
 * 告警日志，不阻断数据库删除，避免出现「后台怎么都删不掉」的死结。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MediaService {
    /** 允许上传的图片类型，由 Tika 嗅探真实内容后比对，不信任客户端传来的 Content-Type。 */
    private static final List<String> ALLOWED = List.of("image/jpeg", "image/png", "image/webp");
    private final MediaAssetMapper assetMapper;
    private final JournalMediaMapper journalMediaMapper;
    private final MediaVisibilityMapper visibilityMapper;
    private final JournalMapper journalMapper;
    private final JournalDocumentService documentService;
    private final TripMapper tripMapper;
    private final com.thx.traveljournal.trip.mapper.TripStopMapper tripStopMapper;
    private final MinioClient minioClient;
    private final AppProperties properties;
    private final Tika tika = new Tika();

    /**
     * 返回给前端的图片视图。
     *
     * @param relationId journal_media 关系 id，删除单张日记图片时使用；旅行封面没有关系行，为 null
     * @param id         media_asset id，设置封面时使用
     */
    public record MediaView(Long relationId, Long id, String filename, String contentType,
                            Integer width, Integer height, String caption, Integer sortOrder,
                            String thumbnailUrl, String mediumUrl, String displayUrl,
                            OffsetDateTime capturedAt, BigDecimal gpsLatitude, BigDecimal gpsLongitude) {}

    /** 按排序号列出某篇日记的全部图片。 */
    public List<MediaView> list(Long journalId) {
        requireJournal(journalId);
        return journalMediaMapper.selectList(new LambdaQueryWrapper<JournalMedia>()
                        .eq(JournalMedia::getJournalEntryId, journalId)
                        .orderByAsc(JournalMedia::getSortOrder, JournalMedia::getId))
                .stream().map(this::toView).toList();
    }

    /**
     * 上传一张日记图片：校验内容、生成展示图和缩略图、写入对象存储，最后建立与日记的关联。
     *
     * @param caption 图片说明，可为空
     */
    @Transactional
    public MediaView upload(Long journalId, MultipartFile file, String caption) {
        JournalEntry journal = requireJournal(journalId);
        long count = journalMediaMapper.selectCount(new LambdaQueryWrapper<JournalMedia>()
                .eq(JournalMedia::getJournalEntryId, journalId));
        if (count >= properties.upload().maxImagesPerJournal()) throw BusinessException.badRequest("单篇日记图片数量已达上限");

        MediaAsset asset = storeImage(file, "trips/" + journal.getTripId() + "/journals/" + journalId + "/");
        JournalMedia relation = new JournalMedia();
        relation.setJournalEntryId(journalId);
        relation.setMediaAssetId(asset.getId());
        relation.setCaption(caption);
        relation.setSortOrder((int) count);
        journalMediaMapper.insert(relation);
        return toView(relation);
    }

    /**
     * 按拍摄时间重排某篇日记的图片。
     *
     * <p>手机相册多选上传时顺序常常是乱的，而照片本身带着 EXIF 拍摄时间，
     * 按它排一次就能还原当天的时间线。没有 EXIF 的图片（截图、别人发的）
     * 保持原有相对顺序并排在最后，不然会被塞到时间线中间莫名其妙的位置。</p>
     *
     * @return 参与排序的图片总数
     */
    @Transactional
    public int sortByCaptureTime(Long journalId) {
        requireJournal(journalId);
        List<JournalMedia> relations = journalMediaMapper.selectList(new LambdaQueryWrapper<JournalMedia>()
                .eq(JournalMedia::getJournalEntryId, journalId)
                .orderByAsc(JournalMedia::getSortOrder, JournalMedia::getId));
        if (relations.size() < 2) return relations.size();

        Map<Long, OffsetDateTime> capturedAt = new HashMap<>();
        for (JournalMedia relation : relations) {
            MediaAsset asset = assetMapper.selectById(relation.getMediaAssetId());
            if (asset != null && asset.getCapturedAt() != null) {
                capturedAt.put(relation.getId(), asset.getCapturedAt());
            }
        }
        if (capturedAt.isEmpty()) throw BusinessException.badRequest("这些图片都没有拍摄时间信息，无法按时间排序");

        List<JournalMedia> sorted = new ArrayList<>(relations);
        // 有时间的按时间升序排在前面；没有的整体沉底，内部保持原顺序（sort 是稳定的）
        sorted.sort(Comparator.comparing(
                (JournalMedia relation) -> capturedAt.get(relation.getId()),
                Comparator.nullsLast(Comparator.naturalOrder())));
        for (int i = 0; i < sorted.size(); i++) {
            JournalMedia relation = sorted.get(i);
            relation.setSortOrder(i);
            journalMediaMapper.updateById(relation);
        }
        return sorted.size();
    }

    /**
     * 根据图片的 GPS 坐标，在给定旅行的城市里找出最接近的一个。
     *
     * <p>用于在编辑器里提示「这些照片看起来是在 XX 拍的」，只做建议不自动改数据——
     * EXIF 坐标可能来自后期补录或别人的设备，替用户做决定容易出错。</p>
     *
     * @return 匹配到的城市名和距离；没有任何图片带 GPS 或旅行没有城市时返回 null
     */
    public CitySuggestion suggestCity(Long journalId) {
        JournalEntry journal = requireJournal(journalId);
        List<MediaAsset> located = journalMediaMapper.selectList(new LambdaQueryWrapper<JournalMedia>()
                        .eq(JournalMedia::getJournalEntryId, journalId))
                .stream().map(relation -> assetMapper.selectById(relation.getMediaAssetId()))
                .filter(asset -> asset != null && asset.getGpsLatitude() != null && asset.getGpsLongitude() != null)
                .toList();
        if (located.isEmpty()) return null;

        List<com.thx.traveljournal.trip.entity.TripStop> stops = tripStopMapper.selectList(
                new LambdaQueryWrapper<com.thx.traveljournal.trip.entity.TripStop>()
                        .eq(com.thx.traveljournal.trip.entity.TripStop::getTripId, journal.getTripId()));
        if (stops.isEmpty()) return null;

        // 用照片坐标的平均值代表「这批照片大致在哪」，比拿第一张更稳
        double avgLat = located.stream().mapToDouble(a -> a.getGpsLatitude().doubleValue()).average().orElse(0);
        double avgLon = located.stream().mapToDouble(a -> a.getGpsLongitude().doubleValue()).average().orElse(0);

        com.thx.traveljournal.trip.entity.TripStop nearest = null;
        double best = Double.MAX_VALUE;
        for (var stop : stops) {
            if (stop.getLatitude() == null || stop.getLongitude() == null) continue;
            double distance = haversineKm(avgLat, avgLon,
                    stop.getLatitude().doubleValue(), stop.getLongitude().doubleValue());
            if (distance < best) { best = distance; nearest = stop; }
        }
        if (nearest == null) return null;
        return new CitySuggestion(nearest.getId(), nearest.getCityName(),
                Math.round(best), located.size());
    }

    /** GPS 推荐结果。distanceKm 是照片位置到该城市的距离，供前端提示可信度。 */
    public record CitySuggestion(Long tripStopId, String cityName, long distanceKm, int photoCount) {}

    /** Haversine 大圆距离，公里。与 YearReviewService 同一套算法，这里只需要标量版本。 */
    private double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1), dLon = Math.toRadians(lon2 - lon1);
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    /** 修改图片说明。 */
    public JournalMedia updateCaption(Long relationId, String caption) {
        JournalMedia relation = requireRelation(relationId);
        relation.setCaption(caption);
        journalMediaMapper.updateById(relation);
        return relation;
    }

    /** 重排某篇日记的图片顺序，传入的 id 列表必须与该日记现有图片完全一致。 */
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

    /** 把日记中的某张图片设为该日记封面。 */
    public void setCover(Long journalId, Long mediaId) {
        JournalEntry journal = requireJournal(journalId);
        long count = journalMediaMapper.selectCount(new LambdaQueryWrapper<JournalMedia>()
                .eq(JournalMedia::getJournalEntryId, journalId).eq(JournalMedia::getMediaAssetId, mediaId));
        if (count == 0) throw BusinessException.badRequest("图片不属于当前日记");
        journal.setCoverMediaId(mediaId);
        journalMapper.updateById(journal);
    }

    /**
     * 删除日记中的单张图片。
     *
     * <p>正文仍引用该图片时拒绝删除；如果它是日记封面或旅行封面，会先自动清空封面引用再删除。</p>
     */
    @Transactional
    public void deleteRelation(Long relationId) {
        JournalMedia relation = requireRelation(relationId);
        MediaAsset asset = requireAsset(relation.getMediaAssetId());
        JournalEntry journal = requireJournal(relation.getJournalEntryId());
        if (documentService.mediaIds(journal.getContentJson()).contains(asset.getId())) {
            throw BusinessException.conflict("正文仍引用该图片，请先从正文移除");
        }
        journalMediaMapper.deleteById(relationId);
        detachCoverReferences(List.of(asset.getId()));
        deleteOrphanAssets(List.of(asset.getId()));
    }

    /**
     * 清空某篇日记的全部图片，供日记级联删除使用。
     *
     * <p>与 {@link #deleteRelation} 不同，这里不检查正文引用——整篇日记都要没了，
     * 正文里的图片地址自然不需要保护。</p>
     *
     * @return 实际删除的图片张数，用于给前端提示
     */
    @Transactional
    public int purgeJournalMedia(Long journalId) {
        List<JournalMedia> relations = journalMediaMapper.selectList(new LambdaQueryWrapper<JournalMedia>()
                .eq(JournalMedia::getJournalEntryId, journalId));
        if (relations.isEmpty()) return 0;
        List<Long> assetIds = relations.stream().map(JournalMedia::getMediaAssetId).distinct().toList();
        journalMediaMapper.delete(new LambdaQueryWrapper<JournalMedia>().eq(JournalMedia::getJournalEntryId, journalId));
        detachCoverReferences(assetIds);
        deleteOrphanAssets(assetIds);
        return relations.size();
    }

    /**
     * 上传并设置旅行封面。
     *
     * <p>旅行封面不挂在任何日记下，因此不产生 {@code journal_media} 关系行；
     * 旧封面如果没有别处引用会一并清理，避免对象存储里堆积无用文件。</p>
     */
    @Transactional
    public MediaView uploadTripCover(Long tripId, MultipartFile file) {
        Trip trip = requireTrip(tripId);
        Long previousCover = trip.getCoverMediaId();
        MediaAsset asset = storeImage(file, "trips/" + tripId + "/cover/");
        trip.setCoverMediaId(asset.getId());
        tripMapper.updateById(trip);
        if (previousCover != null && !previousCover.equals(asset.getId())) deleteOrphanAssets(List.of(previousCover));
        return toView(null, asset, null, null);
    }

    /** 清空旅行封面，旧封面没有别处引用时一并删除。 */
    @Transactional
    public void clearTripCover(Long tripId) {
        Trip trip = requireTrip(tripId);
        Long previousCover = trip.getCoverMediaId();
        if (previousCover == null) return;
        // 用条件更新显式置空：实体的 updateById 默认会跳过 null 字段，清不掉封面
        tripMapper.update(null, new LambdaUpdateWrapper<Trip>()
                .set(Trip::getCoverMediaId, null).eq(Trip::getId, tripId));
        deleteOrphanAssets(List.of(previousCover));
    }

    /**
     * 上传一张主题首页封面图，返回图片信息供前端把 id 填进主题配置。
     *
     * <p>不绑定具体主题：设计器里可能正在新建一个还没保存的主题，此时没有主题 id 可用。
     * 图片先落库，等主题保存时把 id 写进 {@code definition_json.hero.mediaId} 建立引用。</p>
     *
     * <p>换图后的旧图不会自动清理——真要清理得让主题模块反向依赖媒体模块，
     * 为这点存储收益不划算。已被主题引用的图片则受 {@code countThemeHeroReferences} 保护，
     * 不会在删日记、删旅行时被当成孤儿误删。</p>
     */
    @Transactional
    public MediaView uploadThemeHero(MultipartFile file) {
        return toView(null, storeImage(file, "themes/hero/"), null, null);
    }

    /**
     * 图片跳转响应可以被浏览器缓存多久（秒）。
     *
     * <p>取预签名有效期的 70%：跳转到的地址在 TTL 之后就失效了，留出余量避免
     * 用户拿着快过期的地址去请求对象存储。至少给 60 秒，免得 TTL 配得极小时形同没有缓存。</p>
     */
    public long redirectCacheSeconds() {
        return Math.max(60, properties.minio().presignedUrlTtlMinutes() * 60L * 7 / 10);
    }

    /**
     * 生成图片的对象存储预签名访问地址。
     *
     * @param admin 是否为已登录管理员；访客只能访问已公开引用的图片，且拿不到原图
     */
    public URI access(Long mediaId, String variant, boolean admin) {
        MediaAsset asset = requireAsset(mediaId);
        if (!admin && visibilityMapper.countPublishedReferences(mediaId) == 0) {
            throw new BusinessException("FORBIDDEN", "图片不可公开访问", HttpStatus.FORBIDDEN);
        }
        String key = switch (variant) {
            case "thumbnail" -> asset.getThumbnailObjectKey();
            // 存量图片没有 medium，回落到 display——不回落会 404，页面上直接裂图
            case "medium" -> asset.getMediumObjectKey() == null
                    ? asset.getDisplayObjectKey() : asset.getMediumObjectKey();
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

    /**
     * 校验并存储一张图片：嗅探真实类型、按 EXIF 摆正方向、生成 1280 展示图和 480 缩略图，
     * 三个规格都写入对象存储后再落库。中途失败会清理已写入的对象，不留垃圾文件。
     *
     * @param keyPrefix 对象键前缀，方法内部会再拼接一个 uuid 目录，保证不冲突
     */
    private MediaAsset storeImage(MultipartFile file, String keyPrefix) {
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
        // 768 这一档是给手机用的：视口撑死也就 400 逻辑像素，2 倍屏取 768 刚好，
        // 不加这档的话手机也得下 1280 的图，白花一倍多流量
        byte[] medium = resize(normalized, 768);
        byte[] thumbnail = resize(normalized, 480);

        String prefix = keyPrefix + UUID.randomUUID() + "/";
        String originalKey = prefix + "original." + originalFormat;
        String displayKey = prefix + "display.webp";
        String mediumKey = prefix + "medium.webp";
        String thumbnailKey = prefix + "thumbnail.webp";
        String bucket = properties.minio().bucket();
        try {
            put(bucket, originalKey, original, mime);
            put(bucket, displayKey, display, "image/webp");
            put(bucket, mediumKey, medium, "image/webp");
            put(bucket, thumbnailKey, thumbnail, "image/webp");
        } catch (Exception ex) {
            cleanup(bucket, originalKey, displayKey, mediumKey, thumbnailKey);
            throw new BusinessException("STORAGE_ERROR", "图片上传到对象存储失败", HttpStatus.BAD_GATEWAY);
        }

        try {
            MediaAsset asset = new MediaAsset();
            asset.setBucketName(bucket);
            asset.setOriginalObjectKey(originalKey);
            asset.setDisplayObjectKey(displayKey);
            asset.setThumbnailObjectKey(thumbnailKey);
            asset.setMediumObjectKey(mediumKey);
            asset.setOriginalFilename(safeFilename(file.getOriginalFilename()));
            asset.setContentType(mime);
            asset.setFileSize((long) original.length);
            asset.setWidth(normalized.getWidth());
            asset.setHeight(normalized.getHeight());
            asset.setChecksumSha256(sha256(original));
            // 拍摄时间和 GPS 从原始字节读，必须在 encode 之前——重新编码会丢掉 EXIF
            CaptureInfo capture = readCaptureInfo(uploaded);
            asset.setCapturedAt(capture.capturedAt());
            asset.setGpsLatitude(capture.latitude());
            asset.setGpsLongitude(capture.longitude());
            assetMapper.insert(asset);
            return asset;
        } catch (RuntimeException ex) {
            cleanup(bucket, originalKey, displayKey, thumbnailKey);
            throw ex;
        }
    }

    /**
     * 把指向这些图片的封面引用统统清空。
     *
     * <p>数据库外键本身是 {@code on delete set null}，理论上删除图片时会自动置空；
     * 这里显式再清一次，一是不依赖外键行为，二是让同一事务内后续读到的数据是对的。</p>
     */
    private void detachCoverReferences(Collection<Long> assetIds) {
        if (assetIds.isEmpty()) return;
        journalMapper.update(null, new LambdaUpdateWrapper<JournalEntry>()
                .set(JournalEntry::getCoverMediaId, null).in(JournalEntry::getCoverMediaId, assetIds));
        tripMapper.update(null, new LambdaUpdateWrapper<Trip>()
                .set(Trip::getCoverMediaId, null).in(Trip::getCoverMediaId, assetIds));
    }

    /**
     * 删除这些图片中已经没有任何引用的那些（对象存储文件 + 数据库记录）。
     *
     * <p>仍被别的日记引用或仍是某个旅行封面的图片会被跳过。对象存储删除失败只记录告警，
     * 不抛异常打断整个删除流程，遗留的孤儿文件由运维侧按日志清理。</p>
     */
    private void deleteOrphanAssets(Collection<Long> assetIds) {
        for (Long assetId : assetIds) {
            if (assetId == null) continue;
            long journalRefs = journalMediaMapper.selectCount(new LambdaQueryWrapper<JournalMedia>()
                    .eq(JournalMedia::getMediaAssetId, assetId));
            long tripRefs = tripMapper.selectCount(new LambdaQueryWrapper<Trip>().eq(Trip::getCoverMediaId, assetId));
            // 主题封面存在 definition_json 里，不是外键，容易漏判——漏了就会把还在用的封面删掉
            long themeRefs = visibilityMapper.countThemeHeroReferences(assetId);
            if (journalRefs > 0 || tripRefs > 0 || themeRefs > 0) continue;
            MediaAsset asset = assetMapper.selectById(assetId);
            if (asset == null) continue;
            removeObjectQuietly(asset.getBucketName(), asset.getOriginalObjectKey());
            removeObjectQuietly(asset.getBucketName(), asset.getDisplayObjectKey());
            removeObjectQuietly(asset.getBucketName(), asset.getThumbnailObjectKey());
            assetMapper.deleteById(assetId);
        }
    }

    /** 删除单个对象存储文件，失败只记录告警日志。 */
    private void removeObjectQuietly(String bucket, String key) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
        } catch (Exception ex) {
            log.warn("删除对象存储图片失败，已跳过，请手动清理：bucket={} key={}", bucket, key, ex);
        }
    }

    private MediaView toView(JournalMedia relation) {
        MediaAsset asset = requireAsset(relation.getMediaAssetId());
        return toView(relation.getId(), asset, relation.getCaption(), relation.getSortOrder());
    }

    private MediaView toView(Long relationId, MediaAsset asset, String caption, Integer sortOrder) {
        String base = "/api/media/" + asset.getId() + "/";
        return new MediaView(relationId, asset.getId(), asset.getOriginalFilename(), asset.getContentType(),
                asset.getWidth(), asset.getHeight(), caption, sortOrder,
                base + "thumbnail", base + "medium", base + "display",
                asset.getCapturedAt(), asset.getGpsLatitude(), asset.getGpsLongitude());
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
    private Trip requireTrip(Long id) {
        Trip trip = tripMapper.selectById(id);
        if (trip == null) throw BusinessException.notFound("旅行不存在");
        return trip;
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
    /** 等比缩放到指定最长边并转成 webp。 */
    private byte[] resize(BufferedImage source, int maxSize) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            Thumbnails.of(source).size(maxSize, maxSize).outputFormat("webp").outputQuality(0.86).toOutputStream(output);
            return output.toByteArray();
        } catch (IOException ex) {
            throw new BusinessException("IMAGE_PROCESS_ERROR", "生成图片尺寸失败", HttpStatus.BAD_REQUEST);
        }
    }
    /** 重新编码原图，顺带剥掉 EXIF 等元数据，避免泄露拍摄位置。 */
    private byte[] encode(BufferedImage image, String format) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!ImageIO.write(image, format, output)) throw new IOException("缺少图片编码器: " + format);
            return output.toByteArray();
        } catch (IOException ex) {
            throw new BusinessException("IMAGE_PROCESS_ERROR", "图片重新编码失败", HttpStatus.BAD_REQUEST);
        }
    }
    /** 读取 EXIF 方向标记，读不到时按 1（正向）处理。 */
    private int readOrientation(byte[] bytes) {
        try {
            var metadata = ImageMetadataReader.readMetadata(new ByteArrayInputStream(bytes));
            ExifIFD0Directory directory = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            return directory == null ? 1 : directory.getInt(ExifIFD0Directory.TAG_ORIENTATION);
        } catch (Exception ignored) { return 1; }
    }

    /** 从 EXIF 读到的拍摄信息。任一项缺失都为 null，调用方不需要区分「没有 EXIF」和「没有这一项」。 */
    private record CaptureInfo(OffsetDateTime capturedAt, BigDecimal latitude, BigDecimal longitude) {
        static final CaptureInfo EMPTY = new CaptureInfo(null, null, null);
    }

    /**
     * 读取拍摄时间和 GPS 坐标。
     *
     * <p>用途是上传后按拍摄时间排序、按坐标推荐城市，属于锦上添花，
     * 所以任何解析失败都静默退回空值，绝不能因为 EXIF 有问题就让上传失败。</p>
     *
     * <p>注意 EXIF 的拍摄时间不带时区，这里按系统默认时区解释——个人项目里
     * 照片基本来自本人设备，这个近似不会造成困扰。</p>
     */
    private CaptureInfo readCaptureInfo(byte[] bytes) {
        try {
            var metadata = ImageMetadataReader.readMetadata(new ByteArrayInputStream(bytes));
            OffsetDateTime capturedAt = null;
            var exif = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
            if (exif != null) {
                java.util.Date date = exif.getDateOriginal(TimeZone.getDefault());
                if (date != null) capturedAt = date.toInstant().atZone(ZoneId.systemDefault()).toOffsetDateTime();
            }
            BigDecimal latitude = null, longitude = null;
            var gps = metadata.getFirstDirectoryOfType(GpsDirectory.class);
            if (gps != null) {
                var location = gps.getGeoLocation();
                // (0,0) 是设备没定位到时的常见占位值，当作无效
                if (location != null && !location.isZero()) {
                    latitude = BigDecimal.valueOf(location.getLatitude()).setScale(6, RoundingMode.HALF_UP);
                    longitude = BigDecimal.valueOf(location.getLongitude()).setScale(6, RoundingMode.HALF_UP);
                }
            }
            return new CaptureInfo(capturedAt, latitude, longitude);
        } catch (Exception ignored) {
            return CaptureInfo.EMPTY;
        }
    }
    /** 按 EXIF 方向把图片旋转/翻转到正确朝向，5~8 需要交换宽高。 */
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
    /** 去掉上传文件名里的路径和换行，防止对象键或日志被污染。 */
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
