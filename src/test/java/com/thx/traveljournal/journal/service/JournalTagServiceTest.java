package com.thx.traveljournal.journal.service;

import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.journal.entity.JournalTag;
import com.thx.traveljournal.journal.entity.JournalTagRelation;
import com.thx.traveljournal.journal.mapper.JournalTagMapper;
import com.thx.traveljournal.journal.mapper.JournalTagRelationMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class JournalTagServiceTest {
    private JournalTagMapper tagMapper;
    private JournalTagRelationMapper relationMapper;
    private JournalTagService service;
    private final List<JournalTag> inserted = new ArrayList<>();

    @BeforeEach
    void setUp() {
        tagMapper = mock(JournalTagMapper.class);
        relationMapper = mock(JournalTagRelationMapper.class);
        service = new JournalTagService(tagMapper, relationMapper);
        inserted.clear();
        // 默认库里没有任何标签，插入时补上自增 id 并记录下来
        when(tagMapper.selectOne(any())).thenReturn(null);
        when(tagMapper.insert(any(JournalTag.class))).thenAnswer(invocation -> {
            JournalTag tag = invocation.getArgument(0);
            tag.setId((long) (inserted.size() + 1));
            inserted.add(tag);
            return 1;
        });
    }

    @Test
    void 纯中文标签也要生成稳定且唯一的slug() {
        service.replaceTags(1L, List.of("温泉", "拉面"));

        assertThat(inserted).hasSize(2);
        assertThat(inserted.get(0).getSlug()).isNotBlank();
        assertThat(inserted.get(1).getSlug()).isNotBlank();
        // 不同标签不能撞 slug，否则会被当成同一个标签复用
        assertThat(inserted.get(0).getSlug()).isNotEqualTo(inserted.get(1).getSlug());
    }

    @Test
    void 同名标签重复输入只保留一个() {
        service.replaceTags(1L, List.of("温泉", " 温泉 ", "温泉"));

        assertThat(inserted).hasSize(1);
        verify(relationMapper, times(1)).insert(any(JournalTagRelation.class));
    }

    @Test
    void 空白标签被忽略() {
        service.replaceTags(1L, java.util.Arrays.asList("温泉", "", "   ", null));

        assertThat(inserted).hasSize(1);
        assertThat(inserted.get(0).getName()).isEqualTo("温泉");
    }

    @Test
    void 超出数量上限时拒绝() {
        List<String> tooMany = new ArrayList<>();
        for (int i = 0; i < 13; i++) tooMany.add("标签" + i);

        assertThatThrownBy(() -> service.replaceTags(1L, tooMany))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("最多");
    }

    @Test
    void 传null表示不改动标签() {
        service.replaceTags(1L, null);

        verify(relationMapper, never()).delete(any());
        verify(tagMapper, never()).insert(any(JournalTag.class));
    }

    @Test
    void 传空列表表示清空标签() {
        service.replaceTags(1L, List.of());

        // 先删干净，但不插入任何新关联
        verify(relationMapper).delete(any());
        verify(relationMapper, never()).insert(any(JournalTagRelation.class));
    }

    @Test
    void 已存在的标签会被复用而不是重复创建() {
        JournalTag existing = new JournalTag();
        existing.setId(42L);
        existing.setName("温泉");
        when(tagMapper.selectOne(any())).thenReturn(existing);

        service.replaceTags(1L, List.of("温泉"));

        verify(tagMapper, never()).insert(any(JournalTag.class));
        ArgumentCaptor<JournalTagRelation> captor = ArgumentCaptor.forClass(JournalTagRelation.class);
        verify(relationMapper).insert(captor.capture());
        assertThat(captor.getValue().getJournalTagId()).isEqualTo(42L);
    }
}
