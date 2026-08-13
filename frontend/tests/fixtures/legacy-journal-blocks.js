(function () {
  'use strict';

  const CATALOG = [
    { type:'paragraph', label:'正文', icon:'文', category:'文字', description:'一段普通文字' },
    { type:'heading', label:'小标题', icon:'题', category:'文字', description:'划分日记章节' },
    { type:'quote', label:'引用', icon:'引', category:'文字', description:'一句想记住的话' },
    { type:'callout', label:'提示卡片', icon:'记', category:'文字', description:'重点、提醒、心得或注意事项' },
    { type:'facts', label:'信息清单', icon:'值', category:'文字', description:'成对展示名称与内容' },
    { type:'pros-cons', label:'优缺点', icon:'衡', category:'文字', description:'并排记录喜欢与遗憾' },
    { type:'table', label:'表格', icon:'表', category:'文字', description:'整理价格、对比或行程资料' },
    { type:'link-card', label:'链接卡片', icon:'链', category:'文字', description:'收藏攻略、店铺或预订页面' },
    { type:'checklist', label:'清单', icon:'单', category:'记录', description:'待办、行李或打卡清单' },
    { type:'rating', label:'评分', icon:'星', category:'记录', description:'评分并写一句感受' },
    { type:'stats', label:'数字亮点', icon:'数', category:'记录', description:'里程、步数、照片等关键数字' },
    { type:'companions', label:'同行的人', icon:'人', category:'记录', description:'记录旅伴、角色与小故事' },
    { type:'trip-info', label:'旅行信息', icon:'旅', category:'旅行', description:'日期、地点、天气与心情' },
    { type:'route', label:'路线', icon:'线', category:'旅行', description:'按顺序记录途经地点' },
    { type:'itinerary', label:'行程', icon:'程', category:'旅行', description:'时间、活动与地址' },
    { type:'timeline', label:'时间线', icon:'时', category:'旅行', description:'按时间串起一天' },
    { type:'expense-summary', label:'花费', icon:'账', category:'旅行', description:'分类金额与合计' },
    { type:'location-card', label:'地点卡片', icon:'地', category:'旅行', description:'地点、地址、开放时间与感受' },
    { type:'food', label:'美食记录', icon:'食', category:'旅行', description:'菜品、店铺、价格与评分' },
    { type:'stay', label:'住宿记录', icon:'宿', category:'旅行', description:'酒店、房型、晚数与体验' },
    { type:'transport', label:'交通记录', icon:'车', category:'旅行', description:'起终点、班次、时长与备注' },
    { type:'weather', label:'天气记录', icon:'晴', category:'旅行', description:'天气、温度、风和体感' },
    { type:'image', label:'单张图片', icon:'图', category:'图片', description:'图片、图注与尺寸' },
    { type:'gallery', label:'图片组', icon:'组', category:'图片', description:'网格、故事或胶片条' },
    { type:'postcard', label:'旅行明信片', icon:'片', category:'图片', description:'图片搭配地点、寄语和署名' },
    { type:'divider', label:'分隔线', icon:'—', category:'排版', description:'在章节之间留出呼吸' },
    // 一天的开头、中间和结尾。三个都能从旅行工作台自动填，作者不用重复录一遍
    { type:'day-opener', label:'今日开场', icon:'启', category:'旅行', description:'城市、第几天、天气、路线与关键数字' },
    { type:'chapter', label:'章节节点', icon:'节', category:'排版', description:'用时间把一天分成几段' },
    { type:'day-summary', label:'今日小结', icon:'结', category:'旅行', description:'最喜欢、最好吃、走了多少、花了多少' }
  ];

  const clone = value => JSON.parse(JSON.stringify(value));
  const emptyDocument = () => ({ schemaVersion:1, blocks:[] });
  const id = () => 'block_' + Date.now().toString(36) + Math.random().toString(36).slice(2,9);
  const esc = value => String(value == null ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const SAMPLE_IMAGE='data:image/svg+xml;utf8,'+encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#d8cbb4"/><path d="M0 470L230 250l160 150 140-110 370 310H0z" fill="#8da091"/><circle cx="690" cy="150" r="58" fill="#f7e3a1"/><text x="450" y="550" text-anchor="middle" font-size="32" fill="#44564d">旅行照片</text></svg>');

  const lines = value => esc(value).replace(/\n/g,'<br>');
  /** 2026-08-10 → 8月10日。开场卡上写「8月10日」比写完整日期更像日记。 */
  const formatDay = value => String(value||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/,
    (_, y, m, d) => Number(m) + '月' + Number(d) + '日');
  const safeLink = value => /^https?:\/\//i.test(String(value||'')) ? String(value) : '#';
  const defaults = {
    heading:{ text:'', level:2 }, paragraph:{ text:'' }, quote:{ text:'', source:'' },
    callout:{ tone:'note', icon:'', text:'' }, facts:{ items:[{label:'',value:''}] },
    'pros-cons':{ pros:[''], cons:[''] }, table:{ headers:['项目','内容'], rows:[['','']] },
    'link-card':{ url:'', title:'', description:'' },
    rating:{ score:0, max:5, comment:'' }, checklist:{ items:[{text:'',checked:false}] },
    stats:{ items:[{value:'',label:''}] }, companions:{ items:[{name:'',role:'',note:''}] },
    'trip-info':{ date:'', city:'', tripTitle:'', weather:'', mood:'' },
    route:{ items:[''] }, itinerary:{ items:[{time:'',title:'',address:''}] },
    timeline:{ items:[{time:'',title:'',description:''}] },
    'expense-summary':{ currency:'CNY', total:0, categories:[{name:'',amount:0}] },
    'location-card':{ name:'',address:'',hours:'',cost:'',impression:'' },
    food:{ dish:'',restaurant:'',price:'',rating:0,note:'' },
    stay:{ name:'',room:'',nights:1,rating:0,note:'' },
    transport:{ mode:'',from:'',to:'',number:'',duration:'',note:'' },
    weather:{ condition:'',temperature:'',feelsLike:'',wind:'',note:'' },
    image:{ mediaId:null, caption:'' }, gallery:{ mediaIds:[], caption:'' },
    postcard:{ mediaId:null, location:'', date:'', message:'', signature:'' }, divider:{},
    'day-opener':{ city:'', dayLabel:'', date:'', weather:'', route:[], metrics:[] },
    chapter:{ time:'', title:'', note:'' },
    'day-summary':{ items:[{icon:'🌟',label:'今天最喜欢',value:''}] }
  };

  function createBlock(type, initial) {
    const block = { id:id(), type:type, version:1, title:'', data:clone(defaults[type] || {}), settings:{} };
    if (type === 'image' || type === 'gallery' || type === 'postcard')
      block.settings = { size:type === 'postcard' ? 'medium' : '', align:'center', layout:type === 'postcard' ? 'postcard' : '', columns:null,
        ratio:'', focus:'', frame:'', radius:'', tone:'', effect:'', captionPos:'' };
    if(type==='paragraph')block.settings={style:'normal',align:'left'};
    if (initial) {
      if (initial.title) block.title = initial.title;
      Object.assign(block.data, initial.data || initial);
      Object.assign(block.settings, initial.settings || {});
    }
    return block;
  }

  function normalize(document) {
    if (!document || typeof document !== 'object' || !Array.isArray(document.blocks)) return emptyDocument();
    return {
      schemaVersion:1,
      blocks:document.blocks.filter(Boolean).map(source => {
        const block = createBlock(source.type || 'paragraph');
        block.id = source.id || id();
        block.version = 1;
        block.title = source.title || '';
        block.data = Object.assign(block.data, clone(source.data || {}));
        block.settings = Object.assign(block.settings, clone(source.settings || {}));
        return block;
      })
    };
  }

  function mediaMap(media) {
    const map = new Map();
    (media || []).forEach(item => map.set(Number(item.id), item));
    return map;
  }
  function mediaUrl(item, mediaId) {
    return item && item.displayUrl ? item.displayUrl : '/api/media/' + Number(mediaId) + '/display';
  }
  function blockTitle(block) {
    return block.title ? '<h2 class="journal-block__title">' + esc(block.title) + '</h2>' : '';
  }
  function figureClasses(s, extra) {
    // size / align 没有显式选择时不输出覆盖类，让主题的 image.width 等默认值真正生效。
    // 旧内容已经保存了明确值时仍按区块设置优先，不改变既有日记的排版。
    const values=[];
    if(s.size)values.push('journal-figure--'+s.size);
    if(s.align)values.push('journal-figure--'+s.align);
    ['ratio','focus','frame','radius','tone','effect','captionPos'].forEach(key=>{
      if(s[key])values.push('journal-figure--'+(key==='captionPos'?'caption':key)+'-'+s[key]);
    });
    if(extra)values.push(extra);
    return values.map(esc).join(' ');
  }
  function figure(block, map) {
    const d=block.data||{}, s=block.settings||{}, item=map.get(Number(d.mediaId));
    if (!d.mediaId && !d.previewUrl) return '';
    const caption=d.caption || (item && item.caption) || '';
    const src=d.previewUrl||mediaUrl(item,d.mediaId);
    return '<figure class="journal-figure ' + figureClasses(s) + '"><img src="' + esc(src) +
      '" alt="' + esc(caption||'旅行照片') + '" loading="lazy">' +
      (caption ? '<figcaption>' + esc(caption) + '</figcaption>' : '') + '</figure>';
  }
  function gallery(block, map) {
    const d=block.data||{}, s=block.settings||{}, ids=Array.isArray(d.mediaIds)?d.mediaIds:[],
      previews=Array.isArray(d.previewUrls)?d.previewUrls:[];
    if (!ids.length && !previews.length) return '';
    const mode=s.layout||'', columns=s.columns==null?null:Math.max(1,Math.min(6,Number(s.columns)||3));
    const sources=previews.length?previews:ids;
    const visibleSources=mode==='compare'?sources.slice(0,2):sources;
    const images=visibleSources.map(mediaId => {
      const item=map.get(Number(mediaId)), caption=(item&&item.caption)||'旅行照片';
      return '<img src="' + esc(previews.length?mediaId:mediaUrl(item,mediaId)) + '" alt="' + esc(caption) + '" loading="lazy">';
    }).join('');
    const layoutClass=mode?'journal-gallery--'+mode:'';
    const columnsClass=columns==null?'':' journal-gallery--cols-'+columns;
    return '<figure class="journal-gallery ' + figureClasses(s,layoutClass) + columnsClass + '">' + images +
      (d.caption ? '<figcaption>' + esc(d.caption) + '</figcaption>' : '') + '</figure>';
  }
  function postcard(block, map) {
    const d=block.data||{}, item=map.get(Number(d.mediaId)),src=d.previewUrl||mediaUrl(item,d.mediaId);
    const image=(d.mediaId||d.previewUrl) ? '<img src="' + esc(src) + '" alt="' +
      esc(d.location||'旅行明信片') + '" loading="lazy">' : '<div class="journal-postcard__placeholder">旅行明信片</div>';
    return '<figure class="journal-postcard">' + image + '<div class="journal-postcard__writing">' +
      '<div class="journal-postcard__meta"><span>' + esc(d.location) + '</span><time>' + esc(d.date) + '</time></div>' +
      '<p>' + lines(d.message) + '</p>' + (d.signature?'<footer>— ' + esc(d.signature) + '</footer>':'') +
      '</div></figure>';
  }
  function listItems(items, renderer) {
    return (Array.isArray(items)?items:[]).map(renderer).join('');
  }

  function renderBlock(block, media) {
    const d=block.data||{}, title=blockTitle(block), map=media instanceof Map?media:mediaMap(media);
    let body='';
    switch(block.type) {
      case 'heading': {
        const level=Math.max(2,Math.min(4,Number(d.level)||2));
        body='<h' + level + ' class="journal-heading">' + esc(d.text) + '</h' + level + '>'; break;
      }
      case 'paragraph': body='<p class="journal-paragraph journal-paragraph--'+esc((block.settings||{}).style||'normal')+
        ' journal-text--'+esc((block.settings||{}).align||'left')+'">' + lines(d.text) + '</p>'; break;
      case 'quote': body='<blockquote><p>' + lines(d.text) + '</p>' +
        (d.source?'<cite>— '+esc(d.source)+'</cite>':'') + '</blockquote>'; break;
      case 'callout': body='<aside class="journal-callout journal-callout--'+esc(d.tone||'note')+'">' +
        (d.icon?'<b>'+esc(d.icon)+'</b>':'') + '<p>'+lines(d.text)+'</p></aside>'; break;
      case 'facts': body='<dl class="journal-facts">'+listItems(d.items,item=>
        '<div><dt>'+esc(item.label)+'</dt><dd>'+lines(item.value)+'</dd></div>')+'</dl>'; break;
      case 'pros-cons': body='<div class="journal-pros-cons"><section><h3>喜欢</h3><ul>'+listItems(d.pros,item=>'<li>'+esc(item)+'</li>')+
        '</ul></section><section><h3>遗憾</h3><ul>'+listItems(d.cons,item=>'<li>'+esc(item)+'</li>')+'</ul></section></div>'; break;
      case 'table': {
        const headers=Array.isArray(d.headers)?d.headers:[],rows=Array.isArray(d.rows)?d.rows:[];
        body='<div class="journal-table-wrap"><table class="journal-table"><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+
          '</tr></thead><tbody>'+rows.map(row=>'<tr>'+headers.map((_,i)=>'<td>'+lines((row||[])[i]||'')+'</td>').join('')+'</tr>').join('')+
          '</tbody></table></div>'; break;
      }
      case 'link-card': body='<a class="journal-link-card" href="'+esc(safeLink(d.url))+'" target="_blank" rel="noopener noreferrer"><strong>'+esc(d.title||d.url)+
        '</strong>'+(d.description?'<span>'+lines(d.description)+'</span>':'')+'<small>'+esc(d.url)+'</small></a>'; break;
      case 'rating': {
        const max=Math.max(1,Number(d.max)||5), score=Math.max(0,Math.min(max,Number(d.score)||0));
        body='<div class="journal-rating" aria-label="' + score + ' / ' + max + '">' +
          '<span>' + '★'.repeat(score) + '☆'.repeat(max-score) + '</span><b>' + score + '/' + max + '</b></div>' +
          (d.comment?'<p>'+lines(d.comment)+'</p>':''); break;
      }
      case 'checklist': body='<ul class="journal-checklist">' + listItems(d.items,item =>
        '<li class="' + (item.checked?'is-checked':'') + '"><span>' + (item.checked?'✓':'') +
        '</span>' + esc(item.text) + '</li>') + '</ul>'; break;
      case 'stats': body='<div class="journal-stats">'+listItems(d.items,item=>'<div><strong>'+esc(item.value)+'</strong><span>'+esc(item.label)+'</span></div>')+'</div>'; break;
      case 'companions': body='<div class="journal-companions">'+listItems(d.items,item=>'<article><strong>'+esc(item.name)+'</strong>'+
        (item.role?'<span>'+esc(item.role)+'</span>':'')+(item.note?'<p>'+lines(item.note)+'</p>':'')+'</article>')+'</div>'; break;
      case 'trip-info': {
        const values=[d.date,d.city,d.tripTitle,d.weather,d.mood].filter(Boolean);
        body='<div class="journal-trip-info">' + values.map(value=>'<span>'+esc(value)+'</span>').join('') + '</div>'; break;
      }
      case 'route': body='<ol class="journal-route">' + listItems(d.items,item=>'<li>'+esc(item)+'</li>') + '</ol>'; break;
      case 'itinerary':
      case 'timeline': body='<ol class="journal-timeline">' + listItems(d.items,item =>
        '<li><time>'+esc(item.time)+'</time><div><strong>'+esc(item.title)+'</strong>' +
        (item.address?'<small>'+esc(item.address)+'</small>':'') +
        (item.description?'<p>'+lines(item.description)+'</p>':'') + '</div></li>') + '</ol>'; break;
      case 'expense-summary': body='<div class="journal-expenses"><ul>' +
        listItems(d.categories,item=>'<li><span>'+esc(item.name)+'</span><b>'+esc(d.currency||'')+' '+esc(item.amount)+'</b></li>') +
        '</ul><div class="journal-expenses__total"><span>合计</span><strong>'+esc(d.currency||'')+' '+esc(d.total)+'</strong></div></div>'; break;
      case 'location-card': body='<article class="journal-place-card"><header><strong>'+esc(d.name)+'</strong>'+(d.cost?'<b>'+esc(d.cost)+'</b>':'')+'</header>'+
        (d.address?'<span>'+esc(d.address)+'</span>':'')+(d.hours?'<small>开放时间：'+esc(d.hours)+'</small>':'')+(d.impression?'<p>'+lines(d.impression)+'</p>':'')+'</article>'; break;
      case 'food': body='<article class="journal-record-card journal-food"><header><strong>'+esc(d.dish)+'</strong><span>'+esc(d.restaurant)+'</span></header>'+
        '<div>'+(d.price?'<b>'+esc(d.price)+'</b>':'')+(d.rating?'<span>'+'★'.repeat(Math.max(0,Math.min(5,Number(d.rating)||0)))+'</span>':'')+'</div>'+(d.note?'<p>'+lines(d.note)+'</p>':'')+'</article>'; break;
      case 'stay': body='<article class="journal-record-card journal-stay"><header><strong>'+esc(d.name)+'</strong><span>'+esc(d.room)+'</span></header>'+
        '<div><b>'+esc(d.nights||1)+' 晚</b>'+(d.rating?'<span>'+'★'.repeat(Math.max(0,Math.min(5,Number(d.rating)||0)))+'</span>':'')+'</div>'+(d.note?'<p>'+lines(d.note)+'</p>':'')+'</article>'; break;
      case 'transport': body='<article class="journal-transport"><b>'+esc(d.mode||'交通')+'</b><div><strong>'+esc(d.from)+'</strong><i>→</i><strong>'+esc(d.to)+'</strong></div>'+
        '<small>'+[d.number,d.duration].filter(Boolean).map(esc).join(' · ')+'</small>'+(d.note?'<p>'+lines(d.note)+'</p>':'')+'</article>'; break;
      case 'weather': body='<div class="journal-weather"><strong>'+esc(d.condition)+'</strong><b>'+esc(d.temperature)+'</b><span>'+[d.feelsLike&&'体感 '+d.feelsLike,d.wind].filter(Boolean).map(esc).join(' · ')+'</span>'+
        (d.note?'<p>'+lines(d.note)+'</p>':'')+'</div>'; break;
      /*
       * 今日开场卡。
       *
       * 「东京 · Day 4 / 8月10日 · 晴 / 浅草 → 上野 → 银座 / 21,430 步 · ¥8,420」——
       * 这些全都能从旅行、行程和账目里推出来，所以编辑器默认关联数据，作者不用填。
       * 空字段直接不渲染，只写了一半也不会留下一行「· ·」。
       */
      case 'day-opener': {
        const head=[d.city,d.dayLabel].filter(Boolean).map(esc).join(' · ');
        const sub=[formatDay(d.date),d.weather].filter(Boolean).map(esc).join(' · ');
        const route=(Array.isArray(d.route)?d.route:[]).filter(Boolean);
        const metrics=(Array.isArray(d.metrics)?d.metrics:[]).filter(item=>item&&(item.value||item.label));
        body='<header class="journal-day-opener">'+
          (head?'<strong>'+head+'</strong>':'')+
          (sub?'<span>'+sub+'</span>':'')+
          (route.length?'<p class="journal-day-opener__route">'+route.map(esc).join('<i>→</i>')+'</p>':'')+
          (metrics.length?'<div class="journal-day-opener__metrics">'+metrics.map(item=>
            '<div><b>'+esc(item.value)+'</b><span>'+esc(item.label)+'</span></div>').join('')+'</div>':'')+
          '</header>'; break;
      }
      // 章节节点：一天里的一个时间锚点。本质是带时间的小标题，让长日记读起来有节奏。
      case 'chapter': body='<div class="journal-chapter">'+
        (d.time?'<time>'+esc(d.time)+'</time>':'')+'<h3>'+esc(d.title)+'</h3>'+
        (d.note?'<small>'+esc(d.note)+'</small>':'')+'</div>'; break;
      case 'day-summary': {
        const items=(Array.isArray(d.items)?d.items:[]).filter(item=>item&&(item.value||item.label));
        body='<section class="journal-day-summary">'+listItems(items,item=>
          '<article>'+(item.icon?'<b>'+esc(item.icon)+'</b>':'')+
          '<div><span>'+esc(item.label)+'</span><strong>'+esc(item.value)+'</strong></div></article>')+
          '</section>'; break;
      }
      case 'image': body=figure(block,map); break;
      case 'gallery': body=gallery(block,map); break;
      case 'postcard': body=postcard(block,map); break;
      case 'divider': body='<hr>'; break;
      default: return '';
    }
    return '<section class="journal-block journal-block--' + esc(block.type) + '" data-block-id="' +
      esc(block.id) + '">' + (block.type==='heading'?'' : title) + body + '</section>';
  }

  function render(document, media) {
    const normalized=normalize(document), map=mediaMap(media);
    return normalized.blocks.map(block=>renderBlock(block,map)).join('');
  }
  function textContent(document) {
    const values=[];
    normalize(document).blocks.forEach(block => {
      if (block.title) values.push(block.title);
      const visit=value => {
        if (typeof value==='string') values.push(value);
        else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value==='object') Object.values(value).forEach(visit);
      };
      visit(block.data);
    });
    return values.join(' ');
  }
  function wordCount(document) {
    return textContent(document).replace(/\s/g,'').length;
  }
  function sampleDocument(definitions) {
    const blocks=(definitions||[]).map(def => {
      const samples={
        'trip-info':{date:'2026-08-09',city:'成都',tripTitle:'青城山一日游',weather:'晴',mood:'松弛'},
        text:{text:'从这里开始今天的故事。'},textarea:{text:'路上的风、偶遇的人和当时的心情，都会在这里成为一段完整记录。'},
        quote:{text:'有些风景，只有慢下来才看得见。',source:'旅途手记'},rating:{score:4,max:def.config&&def.config.max||5,comment:'值得再来'},
        callout:{tone:'memory',icon:'✦',text:'今天最想记住的，是下山时吹来的那阵风。'},
        facts:{items:[{label:'最佳时间',value:'清晨 8 点前'},{label:'建议停留',value:'半天'}]},
        'pros-cons':{pros:['风景安静','交通方便'],cons:['周末游客较多']},
        table:{headers:['项目','记录'],rows:[['门票','80 元'],['用时','约 5 小时']]},
        'link-card':{url:'https://example.com',title:'旅行攻略与预约信息',description:'出发前收藏的参考页面'},
        checklist:{items:[{text:'看日落',checked:true},{text:'寄明信片',checked:false}]},
        stats:{items:[{value:'18,642',label:'步'},{value:'12.8 km',label:'路程'},{value:'86',label:'张照片'}]},
        companions:{items:[{name:'小满',role:'旅伴',note:'负责发现好吃的小店'}]},
        route:{items:['成都','青城山','街子古镇']},
        itinerary:{items:[{time:'09:30',title:'进入山门',address:'青城山景区'},{time:'15:20',title:'古镇喝茶',address:'街子古镇'}]},
        'expense-summary':{currency:'CNY',total:268,categories:[{name:'交通',amount:88},{name:'餐饮',amount:180}]},
        'location-card':{name:'青城山',address:'成都市都江堰市',hours:'08:00–17:30',cost:'80 元',impression:'树荫很多，适合慢慢走。'},
        food:{dish:'青城老腊肉',restaurant:'山门小馆',price:'68 元',rating:4,note:'咸香，很下饭。'},
        stay:{name:'山里民宿',room:'庭院大床房',nights:1,rating:5,note:'晚上非常安静。'},
        transport:{mode:'高铁',from:'成都犀浦',to:'青城山',number:'C6103',duration:'约 30 分钟',note:'建议提前取票。'},
        weather:{condition:'晴间多云',temperature:'26°C',feelsLike:'25°C',wind:'微风',note:'树荫下很凉快。'},
        image:{previewUrl:SAMPLE_IMAGE,caption:'山间的一刻'},
        gallery:{previewUrls:[SAMPLE_IMAGE,SAMPLE_IMAGE,SAMPLE_IMAGE],caption:'旅途照片'},
        postcard:{previewUrl:SAMPLE_IMAGE,location:'成都',date:'2026-08-09',message:'愿下一次出发时，我们依然对世界好奇。',signature:'远行手记'}
      };
      const type=def.type==='text'||def.type==='textarea'?'paragraph':def.type;
      return createBlock(type,{title:def.title,data:samples[def.type]||{}});
    });
    return {schemaVersion:1,blocks:blocks};
  }

  window.JournalBlocks={ CATALOG:CATALOG, emptyDocument:emptyDocument, normalize:normalize,
    createBlock:createBlock, render:render, renderBlock:renderBlock, wordCount:wordCount,
    textContent:textContent, sampleDocument:sampleDocument };
})();
