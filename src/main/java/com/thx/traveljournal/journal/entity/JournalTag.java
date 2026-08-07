package com.thx.traveljournal.journal.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

/** 日记标签。跨旅行归类用，比如「温泉」「拉面」「登山」。 */
@Getter
@Setter
@TableName("journal_tag")
public class JournalTag extends BaseEntity {
    /** 展示名 */
    private String name;
    /** URL 标识，小写字母数字短横线 */
    private String slug;
}
