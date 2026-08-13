/* 日记模板、主题 DIY、个人资料与标签管理。 */
(function () {
  const { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;
  const { api, A, JM, applyTheme, message, fail, confirm, session, loadSession,
    tripStatusOptions, itineraryTypeOptions, journalStatusLabels, statusLabel, itineraryTypeLabel,
    shortTime, timeRange, IMAGE_TYPES, TAB_ORDER, renderTemplateSample,
    required, check, slugRule, validateForm, fillForm } = window.AdminShared;
  const TemplateManager = {
    setup() {
      const items=ref([]),loading=ref(false),dialog=ref(false),editing=ref(null);
      const previewDialog=ref(false),previewing=ref(null),previewEl=ref(null),builderPreviewEl=ref(null);
      // auto 标记的区块由旅行数据自动填充，查不到数据就整块不生成——说明里必须讲清楚取的是什么
      const blockTypes=[
        {value:'trip-info',label:'旅行信息',auto:true,desc:'自动带出：日记日期、所选城市、旅行标题，再加上你填的天气和心情，渲染成一行引用。'},
        {value:'text',label:'单行文字',desc:'一个单行输入框，写标题式的短句。填写提示语可以在这里预设。'},
        {value:'textarea',label:'长文字',desc:'多行输入框，正文主体一般用这个。'},
        {value:'quote',label:'引用',desc:'你填的内容会渲染成引用块，适合放当天最想记住的一句话。'},
        {value:'rating',label:'评分',desc:'星级评分，生成为 ★★★★☆（4/5）这样的文字。可设置满分。'},
        {value:'checklist',label:'清单',desc:'待办、行李或打卡清单。'},
        {value:'route',label:'路线',auto:true,desc:'自动带出路线。「当天行程」按日记日期取当天行程条目的标题；「旅行城市」取整趟旅行的城市顺序。对应来源没有记录时，这一块不会生成。'},
        {value:'itinerary',label:'行程',auto:true,desc:'自动带出日记当天的行程条目，按时间排成列表（时间 + 标题 + 地址）。当天没有行程记录时，这一块不会生成。'},
        {value:'expense-summary',label:'花费汇总',auto:true,desc:'自动带出支出并按预算分类合计。「当天」只统计日记日期当天的支出，「整趟旅行」统计这次旅行的全部支出。对应范围内没有支出记录时，这一块不会生成。'},
        {value:'image',label:'单图',desc:'填写日记时从已上传图片里选一张插入，可设尺寸和对齐。'},
        {value:'gallery',label:'照片墙',desc:'填写日记时选多张图片，按设定的排布方式生成图组。'},
        {value:'divider',label:'分隔线',desc:'一条水平分隔线，用来断开段落。'}
      ];
      const blockMeta=type=>blockTypes.find(x=>x.value===type)||{};
      const form=reactive({name:'',description:'',category:'CUSTOM',enabled:true,definitionJson:{title:'',blocks:[]}});
      async function load(){loading.value=true;try{items.value=await A.templates(false);}catch(e){fail(e);}finally{loading.value=false;}}
      function reset(){editing.value=null;Object.assign(form,{name:'',description:'',category:'CUSTOM',enabled:true,definitionJson:{title:'',blocks:[]}});}
      function create(){reset();dialog.value=true;}
      function edit(item){editing.value=item.id;Object.assign(form,{name:item.name,description:item.description||'',category:item.category||'CUSTOM',enabled:item.enabled,definitionJson:JSON.parse(JSON.stringify(item.definitionJson))});dialog.value=true;}
      function blockLabel(type){return blockTypes.find(x=>x.value===type)?.label||type;}
      // 用示例数据把区块渲染成成稿的样子——系统模板和正在编辑的模板走同一条路
      const sampleHtml=blocks=>window.JournalBlocks.render(renderTemplateSample(blocks),[]);
      const builderPreview=computed(()=>sampleHtml(form.definitionJson.blocks));
      const previewHtml=computed(()=>previewing.value?sampleHtml(previewing.value.definitionJson?.blocks):'');
      function preview(item){previewing.value=item;previewDialog.value=true;}
      // 预览里也可能有轮播和前后对比，同样要在渲染后补结构
      watch(builderPreview,()=>nextTick(()=>{JM.teardown(builderPreviewEl.value);JM.enhance(builderPreviewEl.value);}));
      watch(previewHtml,()=>nextTick(()=>{JM.teardown(previewEl.value);JM.enhance(previewEl.value);}));
      function addBlock(type){const label=blockLabel(type),config={};if(['text','textarea','quote'].includes(type))config.placeholder='写下这一段';if(['image','gallery'].includes(type)){config.imageSize='medium';config.align='center';}if(type==='gallery')config.layout='grid';if(type==='rating')config.max=5;if(type==='route')config.source='itinerary';if(type==='expense-summary')config.source='expense';form.definitionJson.blocks.push({id:'block_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5),type,title:label,required:false,config});}
      function move(index,offset){const target=index+offset;if(target<0||target>=form.definitionJson.blocks.length)return;const [block]=form.definitionJson.blocks.splice(index,1);form.definitionJson.blocks.splice(target,0,block);}
      function copyBlock(index){const source=form.definitionJson.blocks[index],copy=JSON.parse(JSON.stringify(source));copy.id='block_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5);copy.title+=' 副本';form.definitionJson.blocks.splice(index+1,0,copy);}
      async function save(){if(!form.definitionJson.blocks.length)return ElementPlus.ElMessage.warning('请至少添加一个区块');try{const body={name:form.name,description:form.description,category:form.category,enabled:form.enabled,definitionJson:{title:form.name,blocks:form.definitionJson.blocks}};editing.value?await A.updateTemplate(editing.value,body):await A.createTemplate(body);dialog.value=false;message('模板已保存');load();}catch(e){fail(e);}}
      async function duplicate(item){try{const copy=await A.duplicateTemplate(item.id);message('已复制为“'+copy.name+'”');load();}catch(e){fail(e);}}
      async function remove(item){try{await confirm('确定删除模板“'+item.name+'”吗？');await A.deleteTemplate(item.id);message('模板已删除');load();}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      onMounted(load);
      return{items,loading,dialog,editing,form,blockTypes,blockMeta,previewDialog,previewing,previewHtml,builderPreview,previewEl,builderPreviewEl,
             load,create,edit,preview,blockLabel,addBlock,move,copyBlock,save,duplicate,remove};
    },
    template:`<div><div class="page-head"><div><h2>日记模板</h2><p>把常写的结构保存下来，下次只填当时的天气、心情和故事。</p></div><el-button type="primary" @click="create">新建我的模板</el-button></div>
      <div v-loading="loading" class="template-card-grid"><article v-for="item in items" :key="item.id" class="panel template-card"><header><span>{{item.builtin?'系统模板':'我的模板'}}</span><small>第 {{item.version}} 版</small></header><h3>{{item.name}}</h3><p>{{item.description||'还没有模板说明'}}</p><div class="template-block-tags"><i v-for="block in item.definitionJson.blocks.slice(0,6)" :key="block.id">{{block.title||blockLabel(block.type)}}</i></div><footer><el-button link @click="preview(item)">预览</el-button><el-button link @click="duplicate(item)">复制</el-button><template v-if="!item.builtin"><el-button link type="primary" @click="edit(item)">编辑</el-button><el-button link type="danger" @click="remove(item)">删除</el-button></template></footer></article></div>
      <el-dialog v-model="previewDialog" :title="(previewing?.name||'模板')+' · 预览'" width="min(860px,96vw)" class="template-preview-dialog"><p class="template-preview-note">下面是用示例旅行数据渲染的效果，实际生成时会换成这篇日记所属旅行的真实内容。</p><article ref="previewEl" class="preview journal-document template-preview-body" v-html="previewHtml"></article><template #footer><el-button @click="previewDialog=false">关闭</el-button><el-button v-if="previewing" type="primary" @click="previewDialog=false;duplicate(previewing)">复制为我的模板</el-button></template></el-dialog>
      <el-dialog v-model="dialog" :title="editing?'编辑我的模板':'新建我的模板'" width="min(1320px,96vw)" class="template-editor-dialog"><el-form label-position="top"><div class="form-grid form-grid-2"><el-form-item label="模板名称"><el-input v-model="form.name" maxlength="120" placeholder="例如：海边慢游的一天"/></el-form-item><el-form-item label="是否启用"><el-switch v-model="form.enabled" active-text="启用" inactive-text="停用"/></el-form-item></div><el-form-item label="模板说明"><el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" show-word-limit/></el-form-item></el-form>
        <div class="block-library"><span>添加区块</span><el-tooltip v-for="type in blockTypes" :key="type.value" :content="type.desc" placement="top" :show-after="200" popper-class="block-tip"><button type="button" :class="{auto:type.auto}" @click="addBlock(type.value)">＋ {{type.label}}<i v-if="type.auto" aria-hidden="true">自动</i></button></el-tooltip></div>
        <div class="template-workbench">
        <div class="template-builder"><el-empty v-if="!form.definitionJson.blocks.length" description="从上方添加第一个区块"/><article v-for="(block,index) in form.definitionJson.blocks" :key="block.id" class="template-block-editor"><div class="block-order"><button type="button" :disabled="index===0" @click="move(index,-1)">↑</button><strong>{{index+1}}</strong><button type="button" :disabled="index===form.definitionJson.blocks.length-1" @click="move(index,1)">↓</button></div><div class="block-fields"><div class="block-title-row"><el-input v-model="block.title" placeholder="区块标题，显示为正文里的小标题"><template #prepend>{{blockLabel(block.type)}}</template></el-input><el-switch v-model="block.required" active-text="必填" inactive-text="选填"/></div>
              <p class="block-desc">{{blockMeta(block.type).desc}}</p>
              <el-input v-if="['text','textarea','quote'].includes(block.type)" v-model="block.config.placeholder" placeholder="填写提示语"/>
              <el-select v-if="block.type==='route'" v-model="block.config.source"><el-option label="路线来源：当天行程条目" value="itinerary"/><el-option label="路线来源：整趟旅行的城市顺序" value="trip"/></el-select>
              <el-select v-if="block.type==='expense-summary'" v-model="block.config.source"><el-option label="统计范围：日记当天的支出" value="expense"/><el-option label="统计范围：整趟旅行的全部支出" value="trip"/></el-select>
              <el-input-number v-if="block.type==='rating'" v-model="block.config.max" :min="3" :max="10" controls-position="right" style="width:140px"/><div v-if="['image','gallery'].includes(block.type)" class="form-grid form-grid-2"><el-select v-model="block.config.imageSize"><el-option label="小图" value="small"/><el-option label="中图" value="medium"/><el-option label="大图" value="large"/><el-option label="满宽" value="full"/><el-option label="通栏出血" value="bleed"/></el-select><el-select v-model="block.config.align"><el-option label="居左" value="left"/><el-option label="居中" value="center"/><el-option label="居右" value="right"/></el-select></div><el-select v-if="block.type==='gallery'" v-model="block.config.layout" placeholder="图组排布"><el-option label="竖向逐张排列" value="stack"/><el-option label="并排" value="row"/><el-option label="网格" value="grid"/><el-option label="瀑布流" value="masonry"/><el-option label="拼贴" value="mosaic"/><el-option label="杂志" value="magazine"/><el-option label="故事流" value="story"/><el-option label="错落画廊" value="staggered"/><el-option label="轮播" value="carousel"/><el-option label="胶片条" value="filmstrip"/><el-option label="前后对比" value="compare"/></el-select></div><div class="block-actions"><button type="button" @click="copyBlock(index)">复制</button><button type="button" class="danger" @click="form.definitionJson.blocks.splice(index,1)">删除</button></div></article></div>
        <aside class="template-live-preview"><div class="template-live-head">实时预览<small>示例数据</small></div><article ref="builderPreviewEl" class="preview journal-document template-preview-body" v-html="builderPreview"></article><div v-if="!form.definitionJson.blocks.length" class="template-live-empty">添加区块后这里会显示生成的日记长什么样</div></aside>
        </div>
        <template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存模板</el-button></template></el-dialog>
    </div>`
  };

  const Theme = {
    setup() {
      const themes=ref([]),changing=ref(''),saving=ref(false),editor=ref(false),editing=ref(null),previewFrame=ref(null),previewMode=ref('desktop'),importInput=ref(null);
      const siteState=ref(null);
      const history=ref([]),historyIndex=ref(-1);
      let historyTimer=null,restoring=false,originalSnapshot='',pendingHighlight=null;
      // 预览 iframe 的模拟视口宽度。前台 public.css 的断点是按视口宽度判断的，
      // 而 iframe 内部的视口就是它自身宽度——面板只有 800 出头，会直接落进
      // max-width:900px 的移动端断点，于是「桌面」预览显示的其实是手机布局。
      // 解决办法：iframe 按真实桌面宽度渲染，再用 transform 缩放塞进面板。
      // 桌面不给高度：浏览器窗口高度本来就不固定，让它填满面板能多看到些内容。
      // 手机必须给高度：机身比例是固定的，只按宽度缩放会把 390×844 压成 390×610。
      const PREVIEW_VIEWPORTS={desktop:{width:1280,height:null},mobile:{width:390,height:844}};
      // 三个固定预览场景：首页、日记、地图。三者已经覆盖绝大多数 Theme Token 的
      // 实际落点，不需要更多页面；场景数据在公开端 SFC Fixture 中固定，不依赖真实数据库内容。
      const previewScene=ref('home');
      const previewSrc=computed(()=>'/?theme-preview=1&scene='+previewScene.value+'#/theme-preview-scene');
      const previewWrap=ref(null);
      const previewBox=reactive({scale:1,frameWidth:PREVIEW_VIEWPORTS.desktop.width,frameHeight:800,stageWidth:PREVIEW_VIEWPORTS.desktop.width,stageHeight:800});
      const stageStyle=computed(()=>({width:previewBox.stageWidth+'px',height:previewBox.stageHeight+'px'}));
      const frameStyle=computed(()=>({width:previewBox.frameWidth+'px',height:previewBox.frameHeight+'px',transform:'scale('+previewBox.scale+')'}));
      let previewObserver=null;
      function measurePreview(){
        const wrap=previewWrap.value;
        if(!wrap)return;
        const styles=getComputedStyle(wrap);
        const available=wrap.clientWidth-parseFloat(styles.paddingLeft||0)-parseFloat(styles.paddingRight||0);
        const height=wrap.clientHeight-parseFloat(styles.paddingTop||0)-parseFloat(styles.paddingBottom||0);
        if(available<=0||height<=0)return;
        const viewport=PREVIEW_VIEWPORTS[previewMode.value]||PREVIEW_VIEWPORTS.desktop;
        // 只缩不放。定高的（手机）要同时受宽高约束，机身比例才不会变形；
        // 不定高的（桌面）只按宽度缩，高度反过来由面板高度推算。
        const scale=viewport.height
          ? Math.min(1,available/viewport.width,height/viewport.height)
          : Math.min(1,available/viewport.width);
        const frameHeight=viewport.height||height/scale;
        previewBox.scale=scale;
        previewBox.frameWidth=viewport.width;
        previewBox.frameHeight=frameHeight;
        // 外层占位用缩放后的尺寸，避免未缩放的宽度把面板撑出滚动条
        previewBox.stageWidth=viewport.width*scale;
        previewBox.stageHeight=frameHeight*scale;
      }
      const colorFields=[['background','页面背景'],['surface','内容背景'],['surfaceSoft','柔和背景'],['primary','主要文字'],['primarySoft','次级主色'],['secondary','辅助色'],['accent','强调操作'],['accentHover','强调悬停'],['sand','装饰沙色'],['text','正文颜色'],['muted','弱化文字'],['border','边框颜色'],['danger','危险提示'],['gradientFrom','渐变起色'],['gradientTo','渐变止色']];
      // 必须和后端 ThemePresetService.SCHEMA 的默认值保持一致：
      // completeDefinition 用它补齐缺失区块，缺了哪个区块对应的控件就会报错。
      const defaultDefinition={
        colors:{background:'#F7F2E8',surface:'#FFFCF6',surfaceSoft:'#F1E7D7',primary:'#264A3D',primarySoft:'#42685A',secondary:'#7A8B7F',accent:'#C76D4B',accentHover:'#B65B3B',sand:'#DFC9A8',text:'#2A2D2B',muted:'#77736B',border:'#E6DAC8',danger:'#B7483E',gradientFrom:'#F7F2E8',gradientTo:'#F1E7D7',scheme:'light'},
        typography:{headingFamily:'serif',bodyFamily:'sans',bodySize:16,lineHeight:1.8,letterSpacing:0,headingWeight:700,paragraphSpacing:1.2,headingStyle:'plain'},
        shape:{cardRadius:12,imageRadius:8,buttonRadius:8,borderWidth:1},
        layout:{contentWidth:1200,articleWidth:760,sectionGap:1,density:'comfortable',homeLayout:'editorial',journalLayout:'single'},
        card:{style:'border',opacity:1,blur:0},
        background:{style:'solid',texture:'none',intensity:0.4,mediaId:null},
        image:{style:'natural',shadow:'soft',defaultRatio:'16:9',frame:'none',tone:'none',width:'medium',maxHeight:75},
        gallery:{layout:'grid',columns:3,gap:10},
        motion:{level:'subtle',hover:'lift',entrance:true,scrollReveal:false},
        effects:{particles:'none',grain:false,lightLeak:false,vignette:false},
        map:{style:'auto',routeColor:'#C76D4B',routeWidth:3,markerStyle:'dot',animateRoute:false},
        // Theme Pack V2：决定页面性格的那几层
        decorations:{corner:'none',pageEdge:'none',headerOrnament:'none',opacity:0.35},
        stickers:{density:'none',items:[]},
        dividers:{style:'line',glyph:'none'},
        ambient:{glow:'none',drift:'none',intensity:0.4},
        blockStyles:{callout:'plain',quote:'plain',timeline:'line',stats:'plain',locationCard:'plain',journalMoment:'classic'},
        interactions:{stickerClick:'none',imageHover:'none',heroEntrance:'none'},
        hero:{mediaId:null,shape:'none',overlay:'none'}};

      /**
       * 高级自定义的控件表。一个 token 一行，模板用 v-for 渲染，
       * 新增可调项时后端 SCHEMA 加一行、这里加一行即可，不用改模板结构。
       */
      /**
       * preview 场景标签：控件表用它自动切换右侧预览、给字段贴「首页/日记/地图」的作用范围徽标。
       * tier 决定分在「基础设计」还是「高级效果」，高级默认折叠——参见模板里的 basicGroups/advancedGroups。
       */
      const SCENE_LABEL={home:'首页',journal:'日记',map:'地图'};
      const settingGroups=[
        {key:'typography',label:'字体与排版',preview:'journal',tier:'basic',fields:[
          {key:'headingFamily',label:'标题字体',type:'select',options:[['serif','杂志衬线'],['sans','现代无衬线'],['rounded','圆润黑体'],['mono','等宽字体']]},
          {key:'bodyFamily',label:'正文字体',type:'select',options:[['sans','清晰无衬线'],['serif','沉浸衬线'],['rounded','圆润黑体'],['mono','等宽字体']]},
          {key:'headingStyle',label:'标题装饰',type:'select',options:[['plain','无装饰'],['underline','下划线'],['bar','左侧竖条'],['serif-caps','小型大写'],['outline','描边空心']]},
          {key:'bodySize',label:'正文字号',type:'number',min:14,max:22,step:1},
          {key:'lineHeight',label:'正文行高',type:'number',min:1.4,max:2.4,step:0.05},
          {key:'letterSpacing',label:'字间距 (em)',type:'number',min:-0.02,max:0.24,step:0.01},
          {key:'headingWeight',label:'标题字重',type:'number',min:400,max:900,step:50},
          {key:'paragraphSpacing',label:'段间距 (em)',type:'number',min:0.6,max:2.4,step:0.05}
        ]},
        {key:'shape',label:'圆角与描边',preview:'home',tier:'basic',fields:[
          {key:'cardRadius',label:'卡片圆角',type:'number',min:0,max:32,step:1},
          {key:'imageRadius',label:'图片圆角',type:'number',min:0,max:32,step:1},
          {key:'buttonRadius',label:'按钮圆角',type:'number',min:0,max:32,step:1},
          {key:'borderWidth',label:'描边粗细',type:'number',min:0,max:4,step:1}
        ]},
        {key:'layout',label:'页面布局',preview:'home',tier:'basic',fields:[
          {key:'homeLayout',label:'首页布局',type:'select',target:'首页整体版式',options:[['editorial','旅行杂志'],['classic','整齐卡片'],['bento','Bento 格'],['magazine','杂志栅格'],['timeline','时间轴'],['masonry','瀑布流']]},
          {key:'journalLayout',label:'日记布局',type:'select',preview:'journal',target:'日记正文版式',options:[['single','标准单栏'],['wide','宽栏'],['immersive','沉浸式'],['scrapbook','手账式']]},
          {key:'density',label:'内容密度',type:'select',options:[['compact','紧凑'],['comfortable','舒适'],['relaxed','宽松']]},
          {key:'contentWidth',label:'内容宽度',type:'number',min:960,max:1600,step:20},
          {key:'articleWidth',label:'文章宽度',type:'number',min:600,max:1000,step:20,preview:'journal',target:'正文阅读区',help:'控制日记正文的最大阅读宽度'},
          {key:'sectionGap',label:'区块间距倍数',type:'number',min:0.6,max:2.2,step:0.05}
        ]},
        {key:'card',label:'卡片风格',preview:'home',tier:'basic',fields:[
          {key:'style',label:'卡片外观',type:'select',target:'日记卡片 / 地点卡片',options:[['flat','无边无影'],['border','描边'],['shadow','投影'],['glass','玻璃拟态'],['paper','纸片'],['polaroid','拍立得'],['film','胶片']]},
          {key:'opacity',label:'卡片不透明度',type:'number',min:0.4,max:1,step:0.02},
          {key:'blur',label:'毛玻璃模糊',type:'number',min:0,max:24,step:1,condition:d=>d.card.style==='glass',help:'选择「玻璃拟态」后可调整'}
        ]},
        {key:'background',label:'页面背景',preview:'home',tier:'basic',fields:[
          {key:'style',label:'背景类型',type:'select',options:[['solid','纯色'],['gradient','渐变'],['image','图片']]},
          {key:'texture',label:'叠加纹理',type:'select',options:[['none','无'],['paper','纸纹'],['grain','胶片颗粒'],['noise','噪点'],['dots','圆点'],['grid','网格'],['topo','等高线']]},
          {key:'intensity',label:'纹理强度',type:'number',min:0,max:1,step:0.05,condition:d=>d.background.texture!=='none'||d.background.style==='image',help:'叠加纹理不为「无」，或背景类型选择「图片」后可调整'}
        ]},
        {key:'image',label:'图片默认版式',preview:'journal',tier:'basic',hint:'日记里逐张选过的版式优先，这里只影响没单独设置过的图片',fields:[
          {key:'width',label:'默认宽度',type:'select',options:[['small','小图 42%'],['medium','中图 68%'],['large','大图 90%'],['full','通栏 100%']]},
          {key:'maxHeight',label:'最大高度 (vh)',type:'number',min:30,max:100,step:5},
          {key:'defaultRatio',label:'默认比例',type:'select',options:[['natural','原始比例'],['16:9','16:9'],['4:3','4:3'],['1:1','1:1'],['3:4','3:4']]},
          {key:'frame',label:'相框风格',type:'select',target:'正文单图 / 图片组',options:[['none','无'],['line','细线'],['paper','相纸'],['float','悬浮'],['polaroid','拍立得'],['film','胶片'],['postcard','明信片'],['tape','胶带']]},
          {key:'tone',label:'滤镜',type:'select',options:[['none','原色'],['warm','暖调'],['vintage','复古'],['mono','黑白']]},
          {key:'shadow',label:'图片阴影',type:'select',options:[['none','无'],['soft','轻柔'],['floating','悬浮']]},
          {key:'style',label:'图片风格',type:'select',options:[['natural','自然'],['rounded','柔和圆角'],['paper','相纸']]}
        ]},
        {key:'gallery',label:'多图布局',preview:'journal',tier:'advanced',target:'图片组',fields:[
          {key:'layout',label:'默认排布',type:'select',options:[['grid','网格'],['masonry','瀑布流'],['row','等高一行'],['mosaic','马赛克'],['magazine','杂志'],['carousel','轮播'],['filmstrip','胶片条']]},
          {key:'columns',label:'列数',type:'number',min:2,max:4,step:1,condition:d=>['grid','masonry'].includes(d.gallery.layout),help:'默认排布选择「网格」或「瀑布流」后可调整'},
          {key:'gap',label:'图片间距',type:'number',min:0,max:32,step:2}
        ]},
        {key:'motion',label:'动效',preview:'home',tier:'advanced',fields:[
          {key:'level',label:'动效强度',type:'select',options:[['none','关闭'],['subtle','轻微'],['standard','标准'],['strong','强烈']]},
          {key:'hover',label:'悬停反馈',type:'select',target:'日记卡片',options:[['none','无'],['lift','浮起'],['zoom','放大'],['tilt','倾斜']]},
          {key:'entrance',label:'进入动画',type:'switch'},
          {key:'scrollReveal',label:'滚动揭示',type:'switch'}
        ]},
        {key:'effects',label:'页面特效',preview:'home',tier:'advanced',hint:'默认全关，开启后会常驻运行；系统开启「减少动态效果」时自动失效',fields:[
          {key:'particles',label:'粒子效果',type:'select',target:'全站浮层',options:[['none','关闭'],['snow','雪'],['sakura','樱花'],['leaves','落叶'],['stars','星空'],['dust','浮尘']]},
          {key:'grain',label:'胶片颗粒',type:'switch'},
          {key:'lightLeak',label:'漏光',type:'switch'},
          {key:'vignette',label:'暗角',type:'switch'}
        ]},
        {key:'map',label:'地图视觉',preview:'map',tier:'advanced',fields:[
          {key:'style',label:'地图色调',type:'select',options:[['auto','跟随明暗'],['light','明亮'],['dark','暗色'],['vintage','复古'],['terrain','地形增强']]},
          {key:'markerStyle',label:'标记样式',type:'select',target:'地图 · 标记',options:[['dot','圆点'],['pin','水滴'],['ring','圆环'],['photo','大圆点']]},
          {key:'routeColor',label:'路线颜色',type:'color',target:'地图 · 路线',help:'只在页面存在路线时才看得到效果，例如日记的「今日路线」'},
          {key:'routeWidth',label:'路线粗细',type:'number',min:1,max:8,step:1,target:'地图 · 路线',help:'只在页面存在路线时才看得到效果，例如日记的「今日路线」'},
          {key:'animateRoute',label:'路线绘制动画',type:'switch',target:'地图 · 路线',help:'只在页面存在路线时才看得到效果，例如日记的「今日路线」'}
        ]},
        {key:'decorations',label:'页面装饰',preview:'home',tier:'basic',hint:'用来填补页面的空旷，不是用来填满页面；透明度默认压得很低',fields:[
          {key:'corner',label:'页面角落',type:'select',options:[['none','无'],['vine','藤蔓'],['wave','海浪'],['leaf','落叶'],['frost','霜花'],['stamp','邮戳'],['compass','指南针']]},
          {key:'pageEdge',label:'页边点缀',type:'select',preview:'journal',target:'日记正文两侧',options:[['none','无'],['petal','花瓣'],['sun','太阳'],['leaf','落叶'],['snow','雪花'],['star','星星']]},
          {key:'headerOrnament',label:'标题纹样',type:'select',options:[['none','无'],['line','短线'],['compass','指南针'],['ticket','车票'],['arch','拱形'],['wave','波浪']]},
          {key:'opacity',label:'装饰浓度',type:'number',min:0.05,max:1,step:0.05,condition:d=>d.decorations.corner!=='none'||d.decorations.pageEdge!=='none'||d.decorations.headerOrnament!=='none',help:'至少开启一项页面装饰后可调整'}
        ]},
        {key:'stickers',label:'主题贴纸',preview:'journal',tier:'advanced',hint:'位置只能从固定的几个区域里选，这样手机上不会错位；贴纸列表在下面单独编辑',fields:[
          {key:'density',label:'贴纸密度',type:'select',options:[['none','不显示'],['low','少量'],['medium','适中']]}
        ]},
        {key:'dividers',label:'章节分隔线',preview:'journal',tier:'advanced',target:'章节之间的分隔线',fields:[
          {key:'style',label:'线条样式',type:'select',options:[['line','细线'],['dashed','虚线'],['dotted','点线'],['ornament','两端渐隐'],['wave','波浪'],['torn','撕纸边']]},
          {key:'glyph',label:'中间符号',type:'select',options:[['none','无'],['sakura','🌸 樱花'],['sun','☀ 太阳'],['leaf','🍂 落叶'],['snow','❄ 雪花'],['compass','✧ 指南针'],['plane','✈ 飞机'],['stamp','❖ 邮戳'],['wave','〜 波浪'],['star','✦ 星星']]}
        ]},
        {key:'ambient',label:'环境氛围',preview:'home',tier:'advanced',hint:'比粒子更安静的一层：一片很淡的光，或者一分钟才移动一点点的云',fields:[
          {key:'glow',label:'光晕',type:'select',options:[['none','无'],['sun','阳光'],['moon','月光'],['lantern','灯光'],['dawn','晨曦']]},
          {key:'drift',label:'缓慢移动层',type:'select',options:[['none','无'],['clouds','云'],['mist','薄雾'],['fireflies','萤火']]},
          {key:'intensity',label:'氛围强度',type:'number',min:0,max:1,step:0.05,condition:d=>d.ambient.glow!=='none'||d.ambient.drift!=='none',help:'开启光晕或缓慢移动层后可调整'}
        ]},
        {key:'blockStyles',label:'内容块皮肤',preview:'journal',tier:'advanced',hint:'同一种内容块在不同主题里可以长得不一样',fields:[
          {key:'callout',label:'提示卡片',type:'select',options:[['plain','默认'],['paper','纸片'],['tape','胶带'],['ticket','票根'],['frame','双线框']]},
          {key:'quote',label:'引用',type:'select',options:[['plain','默认'],['mark','大引号'],['card','卡片'],['handwritten','手写感']]},
          {key:'timeline',label:'时间线',type:'select',options:[['line','竖线'],['dots','圆点'],['stamps','邮戳时间'],['tickets','车票时间']]},
          {key:'stats',label:'数字亮点',type:'select',options:[['plain','默认'],['badge','药丸'],['ticket','票根']]},
          {key:'locationCard',label:'地点卡片',type:'select',options:[['plain','默认'],['postcard','明信片'],['label','标签条'],['passport','护照页']]},
          {key:'journalMoment',label:'开场/章节/小结',type:'select',target:'今日开场 / 章节节点 / 今日小结',options:[['classic','经典'],['spring','春日花枝'],['summer','夏日阳光'],['autumn','秋日车票'],['winter','冬日霜花'],['retro','复古邮戳']]}
        ]},
        {key:'interactions',label:'互动',preview:'journal',tier:'advanced',hint:'只能从预先写好的这几种里选，主题配置里永远不会出现脚本',fields:[
          {key:'stickerClick',label:'点击贴纸',type:'select',condition:d=>(d.stickers?.items||[]).length>0,help:'先在「主题贴纸」里添加至少一张贴纸后可调整',options:[['none','无反应'],['pop','弹一下'],['wiggle','摇一摇'],['drift','飘走'],['heart-pop','心跳']]},
          {key:'imageHover',label:'鼠标经过照片',type:'select',options:[['none','无'],['tilt','轻微倾斜'],['zoom','轻微放大'],['lift','浮起'],['stamp','按下去']]},
          {key:'heroEntrance',label:'封面入场',type:'select',preview:'home',target:'首页封面',options:[['none','无'],['float','上浮'],['fade','淡入'],['drift','横向滑入']]}
        ]},
        {key:'hero',label:'首页封面',preview:'home',tier:'basic',fields:[
          {key:'shape',label:'底边形状',type:'select',options:[['none','平直'],['wave','波浪'],['arch','拱形'],['torn','撕纸'],['tape','胶带']]},
          {key:'overlay',label:'叠加光',type:'select',options:[['none','无'],['sun','阳光'],['frost','霜白'],['paper','纸感'],['dusk','暮色']]}
        ]}
      ];
      const basicGroups=computed(()=>settingGroups.filter(g=>g.tier!=='advanced'));
      const advancedGroups=computed(()=>settingGroups.filter(g=>g.tier==='advanced'));
      /** 字段实际生效场景：字段自己声明的 preview 优先，否则沿用所属分组的。 */
      function fieldScene(group,field){return field.preview||group.preview||'home';}
      function fieldDisabled(field){return typeof field.condition==='function'&&!field.condition(form.definitionJson);}
      /**
       * 用户碰了某个设置：自动把预览切到对应场景，并让 iframe 里的目标元素短暂高亮，
       * 这样不用来回猜「这个设置到底改了哪里」。高亮只按分组给一个代表性 selector，
       * 不追求每个字段各自精确，够用且维护成本低。
       */
      const GROUP_HIGHLIGHT_SELECTOR={
        colors:'body, .hero', typography:'.journal-paragraph, .article-head h1', shape:'.journal-card, .stat',
        layout:'.home-page, .article', card:'.journal-card', background:'.home-page-shell, .page',
        image:'.journal-figure', gallery:'.journal-gallery', motion:'.journal-card', effects:'body',
        map:'.map-box', decorations:'.journal-block', stickers:'.tj-sticker',
        dividers:'.journal-block--divider', ambient:'body',
        blockStyles:'.journal-block--quote, .journal-block--callout, .journal-block--timeline, .journal-block--stats, .journal-block--location-card',
        interactions:'.tj-sticker, .journal-figure', hero:'.hero, .hero-photo'
      };
      function onFieldTouched(group,field){
        const scene=fieldScene(group,field);
        const selector=GROUP_HIGHLIGHT_SELECTOR[group.key]||null;
        pendingHighlight=selector;
        if(previewScene.value!==scene){previewScene.value=scene;return;}
        pendingHighlight=null;
        sendPreviewHighlight(selector);
      }
      function sendPreviewHighlight(selector){nextTick(()=>{
          const frame=previewFrame.value?.contentWindow;
          if(!frame)return;
          try{frame.postMessage({type:'travel-theme-highlight',selector},location.origin);}
          catch(_){}
        });}
      function previewLoaded(){
        postPreview();
        if(pendingHighlight){const selector=pendingHighlight;pendingHighlight=null;setTimeout(()=>sendPreviewHighlight(selector),80);}
      }
      /*
       * 贴纸列表单独编辑。
       *
       * 它是唯一一个不是「一个键一个值」的配置，所以走不了上面那张控件表。
       * 位置写死在这份白名单里，主题只能说「贴在页眉右边」，不能写像素坐标——
       * 绝对坐标在手机上一定会错位，而且每加一个断点就要把所有主题重调一遍。
       */
      const STICKER_AREAS=[['hero-left','页眉左'],['hero-right','页眉右'],['page-left','页面左侧'],
        ['page-right','页面右侧'],['section-gap','章节之间'],['image-corner','图片旁'],['footer','页脚']];
      const STICKER_ASSETS=[
        {group:'春',items:[['spring-sakura','樱花'],['spring-sprout','嫩芽'],['spring-bird','小鸟'],['spring-cloud','云朵']]},
        {group:'夏',items:[['summer-sun','太阳'],['summer-wave','海浪'],['summer-drink','冰饮'],['summer-watermelon','西瓜']]},
        {group:'秋',items:[['autumn-maple','枫叶'],['autumn-leaf','落叶'],['autumn-coffee','咖啡'],['autumn-ticket','火车票']]},
        {group:'冬',items:[['winter-snowflake','雪花'],['winter-mug','热咖啡'],['winter-cabin','小屋'],['winter-pine','松树']]},
        {group:'复古',items:[['retro-stamp','邮票'],['retro-postmark','邮戳'],['retro-plane','飞机'],['retro-passport','护照']]},
        {group:'经典',items:[['classic-compass','指南针'],['classic-pin','地图针'],['classic-tag','行李牌']]}
      ];
      const MAX_STICKERS=10;
      const stickerItems=computed(()=>form.definitionJson.stickers?.items||[]);
      function addSticker(){
        const stickers=form.definitionJson.stickers;
        if(!Array.isArray(stickers.items))stickers.items=[];
        if(stickers.items.length>=MAX_STICKERS)return;
        stickers.items.push({asset:'classic-compass',area:'section-gap'});
        if(stickers.density==='none')stickers.density='low';
        onFieldTouched(settingGroups.find(g=>g.key==='stickers'),{preview:'journal'});
      }
      function removeSticker(index){form.definitionJson.stickers.items.splice(index,1);onFieldTouched(settingGroups.find(g=>g.key==='stickers'),{preview:'journal'});}
      function stickerPreview(asset){return '/assets/themes/stickers/'+asset+'.svg';}
      const form=reactive({name:'',description:'',baseThemeKey:'travel-classic',previewImageUrl:'',enabled:true,definitionJson:JSON.parse(JSON.stringify(defaultDefinition))});
      const contrast=computed(()=>{const ratio=contrastRatio(form.definitionJson.colors.text,form.definitionJson.colors.background);return{ratio:ratio.toFixed(2),ok:ratio>=4.5};});
      const canUndo=computed(()=>historyIndex.value>0),canRedo=computed(()=>historyIndex.value<history.value.length-1);
      function deep(value){return JSON.parse(JSON.stringify(value));}
      function completeDefinition(input){const result=deep(defaultDefinition);Object.keys(result).forEach(section=>Object.assign(result[section],input?.[section]||{}));return result;}
      function changedPaths(){
        if(!originalSnapshot)return [];
        const before=JSON.parse(originalSnapshot).definitionJson||{};
        const after=form.definitionJson||{};
        const paths=[];
        Object.keys(defaultDefinition).forEach(section=>{
          const keys=new Set([...Object.keys(before[section]||{}),...Object.keys(after[section]||{})]);
          keys.forEach(key=>{if(JSON.stringify(before[section]?.[key])!==JSON.stringify(after[section]?.[key]))paths.push(section+'.'+key);});
        });
        return paths;
      }
      async function load(){
        try{
          const result=await Promise.all([A.themes(false),A.siteThemeState()]);
          themes.value=result[0];siteState.value=result[1];
        }catch(e){fail(e);}
      }
      /*
       * 全站主题的两种模式。
       *
       * 「跟随季节」是默认：8 月自动是盛夏出逃，到了 9 月自己变成秋日远行，作者
       * 什么都不用做。一旦点了某一套具体主题就锁成 FIXED，之后季节更替不再动它，
       * 直到重新点「跟随季节」。isActive 判断的是「这张卡片是不是当前生效的那套」，
       * 在 AUTO 模式下等于当季主题，而不是 session 里存的 themeKey。
       */
      const isAuto=computed(()=>siteState.value?.mode!=='FIXED');
      const activeThemeKey=computed(()=>siteState.value?.theme?.themeKey||session.user?.themeKey);
      function isActive(item){return !isAuto.value&&activeThemeKey.value===item.themeKey;}
      /** 「跟随季节」卡片上那行小字：夏 · 盛夏出逃。 */
      const seasonHint=computed(()=>{
        const state=siteState.value;if(!state)return '';
        const name=themes.value.find(item=>item.themeKey===state.seasonThemeKey)?.name;
        return [state.season,name].filter(Boolean).join(' · ');
      });
      async function selectTheme(item) {
        if (isActive(item)) return;
        changing.value = item.themeKey;
        try {
          const updated = await api.auth.changeTheme(item.themeKey);
          session.user = { ...session.user, ...updated };
          applyTheme(item);
          siteState.value = await A.siteThemeState();
          message('主题已切换为“' + item.name + '”，季节变化不会再改动它');
        } catch (error) { fail(error); }
        finally { changing.value = ''; }
      }
      /** 切回跟随季节：立刻套用当季那一套，并把模式记回服务端。 */
      async function followSeason(){
        if(isAuto.value)return;
        changing.value='__auto__';
        try{
          const updated=await api.auth.changeTheme(null,'AUTO');
          session.user={...session.user,...updated};
          siteState.value=await A.siteThemeState();
          applyTheme(siteState.value.theme);
          message('已切回跟随季节，当前是' + seasonHint.value);
        }catch(error){fail(error);}
        finally{changing.value='';}
      }
      function snapshot(){return JSON.stringify({name:form.name,description:form.description,baseThemeKey:form.baseThemeKey,previewImageUrl:form.previewImageUrl,enabled:form.enabled,definitionJson:form.definitionJson});}
      function assignSnapshot(value){restoring=true;const data=typeof value==='string'?JSON.parse(value):value;form.name=data.name;form.description=data.description||'';form.baseThemeKey=data.baseThemeKey||'travel-classic';form.previewImageUrl=data.previewImageUrl||'';form.enabled=data.enabled!==false;form.definitionJson=completeDefinition(data.definitionJson);nextTick(()=>{restoring=false;postPreview();});}
      function seedHistory(){originalSnapshot=snapshot();history.value=[originalSnapshot];historyIndex.value=0;}
      function pushHistory(){const value=snapshot();if(value===history.value[historyIndex.value])return;history.value=history.value.slice(0,historyIndex.value+1);history.value.push(value);if(history.value.length>30)history.value.shift();historyIndex.value=history.value.length-1;}
      function undo(){if(!canUndo.value)return;historyIndex.value--;assignSnapshot(history.value[historyIndex.value]);}
      function redo(){if(!canRedo.value)return;historyIndex.value++;assignSnapshot(history.value[historyIndex.value]);}
      function resetEditor(){assignSnapshot(originalSnapshot);history.value=[originalSnapshot];historyIndex.value=0;}
      // 系统主题现在也能直接进设计器改：不再要求先复制一份。editingBuiltin 标记
      // 这次编辑的是不是系统主题——名称、说明这些官方身份信息在这种情况下禁止修改，
      // 只有视觉配置会被后端收进 overrideJson。
      const editingBuiltin=ref(false),editingSource=ref(null);
      function openEditor(item,forceNew=false){
        const source=item||themes.value.find(x=>x.themeKey===activeThemeKey.value)||themes.value[0];
        editing.value=forceNew?null:(source?.id||null);
        editingBuiltin.value=!forceNew&&!!source?.builtin;
        editingSource.value=forceNew?null:source||null;
        assignSnapshot({name:forceNew?'我的旅行主题':source?.name||'我的旅行主题',description:source?.description||'',baseThemeKey:source?.baseThemeKey||'travel-classic',previewImageUrl:source?.previewImageUrl||'',enabled:true,definitionJson:source?.definitionJson||defaultDefinition});
        editor.value=true;nextTick(()=>{seedHistory();postPreview();});
      }
      async function duplicateTheme(item){try{const created=await A.duplicateTheme(item.id);await load();openEditor(created,false);message('已复制主题，可以开始设计');}catch(e){fail(e);}}
      async function saveTheme(){saving.value=true;try{const body={name:form.name,description:form.description,baseThemeKey:form.baseThemeKey,previewImageUrl:form.previewImageUrl||null,enabled:form.enabled,definitionJson:form.definitionJson};if(editingBuiltin.value)body.changedPaths=changedPaths();const saved=editing.value?await A.updateTheme(editing.value,body):await A.createTheme(body);if(activeThemeKey.value===saved.themeKey)applyTheme(saved);editor.value=false;await load();message('主题已保存');}catch(e){fail(e);}finally{saving.value=false;}}
      async function removeTheme(item){try{await confirm('确定删除主题“'+item.name+'”吗？');await A.deleteTheme(item.id);await load();message('主题已删除');}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      /**
       * 还原系统主题的官方默认：清空服务端的 overrideJson。如果正好在设计器里编辑
       * 这一套主题，顺带把表单也刷新成官方值，不用关掉弹窗重开。
       */
      async function restoreOfficial(item){
        if(!item)return;
        try{
          await confirm('确定要把「'+item.name+'」还原为官方默认吗？你在它上面做的修改会被清空，且不能撤销。');
          const updated=await A.resetTheme(item.id);
          if(activeThemeKey.value===updated.themeKey)applyTheme(updated);
          await load();
          if(editor.value&&editing.value===item.id){
            assignSnapshot({name:updated.name,description:updated.description||'',baseThemeKey:updated.baseThemeKey,previewImageUrl:updated.previewImageUrl||'',enabled:updated.enabled,definitionJson:updated.definitionJson});
            editingSource.value=updated;
            seedHistory();
          }
          message('已还原为官方默认');
        }catch(e){if(e!=='cancel'&&e!=='close')fail(e);}
      }
      async function restoreEditingOfficial(){
        if(!editingSource.value)return;
        await restoreOfficial(editingSource.value);
      }
      // ——— 查看已修改项 ———
      // overrideJson 本身就是稀疏的，它的叶子键就是「改过什么」，不需要额外做 diff 计算；
      // 这里只负责把 section.key 映射回 settingGroups 里已经写好的中文 label。
      const diffDialog=ref(false),diffTarget=ref(null);
      function viewDiff(item){diffTarget.value=item;diffDialog.value=true;}
      function fieldLabel(section,key){
        if(section==='colors'){const hit=colorFields.find(c=>c[0]===key);return '色彩 · '+(hit?hit[1]:key);}
        const group=settingGroups.find(g=>g.key===section);
        const field=group?.fields.find(f=>f.key===key);
        if(group&&field)return group.label+' · '+field.label;
        if(section==='stickers'&&key==='items')return '主题贴纸 · 贴纸列表';
        if(section==='hero')return '首页封面 · '+key;
        return section+'.'+key;
      }
      function formatValue(value){
        if(value===undefined||value===null)return '（未设置）';
        if(Array.isArray(value))return value.length+' 项';
        if(typeof value==='object')return JSON.stringify(value);
        return String(value);
      }
      const diffEntries=computed(()=>{
        const item=diffTarget.value;
        const rows=[];
        if(!item?.overrideJson)return rows;
        Object.keys(item.overrideJson).forEach(section=>{
          const overrideSection=item.overrideJson[section];
          const officialSection=item.officialDefinitionJson?.[section];
          if(overrideSection&&typeof overrideSection==='object'&&!Array.isArray(overrideSection)){
            Object.keys(overrideSection).forEach(key=>rows.push({
              label:fieldLabel(section,key),
              oldValue:officialSection?.[key],
              newValue:overrideSection[key]
            }));
          }else{
            rows.push({label:fieldLabel(section,section),oldValue:officialSection,newValue:overrideSection});
          }
        });
        return rows;
      });
      // 把当前设计推给预览 iframe。改一个颜色就会触发一次，所以预览页没能正常加载时
      // （contentWindow 的 origin 变成 null，postMessage 直接抛错）要吞掉异常，
      // 否则控制台会被同一条报错刷屏——真正的原因浏览器自己已经报出来了。
      function postPreview(){nextTick(()=>{
        const frame=previewFrame.value?.contentWindow;
        if(!frame)return;
        try{frame.postMessage({type:'travel-theme-preview',theme:{themeKey:'preview',baseThemeKey:form.baseThemeKey,definitionJson:deep(form.definitionJson)}},location.origin);}
        catch(_){}
      });}
      function postCardPreview(event,item){
        const frame=event.currentTarget?.contentWindow;
        if(!frame)return;
        try{frame.postMessage({type:'travel-theme-preview',theme:{themeKey:item.themeKey,baseThemeKey:item.baseThemeKey,definitionJson:deep(item.definitionJson)}},location.origin);}
        catch(_){}
      }
      function exportTheme(item){const payload={schemaVersion:1,name:item.name,description:item.description,baseThemeKey:item.baseThemeKey,previewImageUrl:item.previewImageUrl,definitionJson:item.definitionJson};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=item.themeKey+'.json';link.click();URL.revokeObjectURL(link.href);}
      function chooseImport(){importInput.value.click();}
      async function imported(event){const file=event.target.files[0];event.target.value='';if(!file)return;try{const data=JSON.parse(await file.text());if(!data.definitionJson)throw new Error('文件中缺少 definitionJson');assignSnapshot({name:(data.name||'导入的主题')+' · 导入',description:data.description||'',baseThemeKey:data.baseThemeKey||'travel-classic',previewImageUrl:data.previewImageUrl||'',enabled:true,definitionJson:data.definitionJson});editing.value=null;editor.value=true;nextTick(()=>{seedHistory();postPreview();});}catch(e){fail(new Error('导入失败：'+e.message));}}
      // ——— 预设 ———
      // 预设就是 builtin 的主题记录，套用时只替换视觉配置，保留用户已填的名称和说明，
      // 这样「先起名 → 挑个预设打底 → 再微调」这条路走得通。
      const builtinThemes=computed(()=>themes.value.filter(item=>item.builtin));
      function applyPreset(item){
        form.definitionJson=completeDefinition(item.definitionJson);
        onFieldTouched({key:'background',preview:'home'},{preview:'home'});
        message('已套用「'+item.name+'」，可以继续微调');
      }
      /** 预设色卡：用背景 / 主色 / 强调色三段拼一个小色条 */
      function presetSwatch(item){
        const c=item.definitionJson?.colors||{};
        return {background:'linear-gradient(90deg,'+(c.background||'#eee')+' 0 34%,'+(c.primary||'#666')+' 34% 67%,'+(c.accent||'#c76d4b')+' 67% 100%)'};
      }

      // ——— 首页封面图 ———
      // 只在配置里存 media id，展示地址前端自己拼。上传后立刻推给预览，
      // 但要等主题保存才真正生效（definitionJson 随主题一起提交）。
      const heroInput=ref(null),heroUploading=ref(false);
      const heroUrl=computed(()=>{
        const id=form.definitionJson.hero?.mediaId;
        return id?'/api/media/'+id+'/display':'';
      });
      function chooseHero(){heroInput.value?.click();}
      async function heroPicked(event){
        const file=event.target.files?.[0];
        event.target.value='';
        if(!file)return;
        heroUploading.value=true;
        try{
          const body=new FormData();
          body.append('file',file);
          const asset=await A.uploadThemeHero(body);
          if(!form.definitionJson.hero)form.definitionJson.hero={mediaId:null};
          form.definitionJson.hero.mediaId=asset.id;
          onFieldTouched(settingGroups.find(g=>g.key==='hero'),{preview:'home'});
          message('封面已上传，保存主题后生效');
        }catch(e){fail(e);}
        finally{heroUploading.value=false;}
      }
      function clearHero(){if(form.definitionJson.hero)form.definitionJson.hero.mediaId=null;onFieldTouched(settingGroups.find(g=>g.key==='hero'),{preview:'home'});}
      function luminance(hex){const values=String(hex).replace('#','').match(/.{2}/g)?.map(x=>parseInt(x,16)/255)||[0,0,0];return values.map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);}
      function contrastRatio(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
      watch(form,()=>{postPreview();if(restoring||!editor.value)return;clearTimeout(historyTimer);historyTimer=setTimeout(pushHistory,280);},{deep:true});
      // 弹窗是 destroy-on-close，每次打开都是新元素，所以监听 ref 本身而不是只在挂载时接一次
      watch(previewWrap,element=>{
        previewObserver?.disconnect();
        previewObserver=null;
        if(!element)return;
        previewObserver=new ResizeObserver(measurePreview);
        previewObserver.observe(element);
      });
      watch(previewMode,()=>nextTick(measurePreview));
      onMounted(load);
      onBeforeUnmount(()=>{clearTimeout(historyTimer);previewObserver?.disconnect();});
      return {session,themes,changing,editor,editing,editingBuiltin,editingSource,previewFrame,previewMode,previewScene,previewSrc,previewWrap,stageStyle,frameStyle,importInput,form,colorFields,settingGroups,basicGroups,advancedGroups,SCENE_LABEL,fieldScene,fieldDisabled,onFieldTouched,builtinThemes,applyPreset,presetSwatch,contrast,canUndo,canRedo,heroInput,heroUploading,heroUrl,chooseHero,heroPicked,clearHero,selectTheme,openEditor,duplicateTheme,saveTheme,removeTheme,postPreview,previewLoaded,postCardPreview,exportTheme,chooseImport,imported,undo,redo,resetEditor,restoreOfficial,restoreEditingOfficial,
        siteState,isAuto,isActive,seasonHint,followSeason,
        diffDialog,diffTarget,viewDiff,diffEntries,formatValue,
        stickerItems,stickerAreas:STICKER_AREAS,stickerAssets:STICKER_ASSETS,addSticker,removeSticker,stickerPreview};
    },
    template: `<div><div class="page-head"><div><h2>主题外观</h2><p>让网站跟着四季自己变，或者固定选一套；也可以复制后设计自己的色彩、字体、布局与图片风格。</p></div><div class="theme-page-actions"><input ref="importInput" type="file" accept="application/json" hidden @change="imported"><el-button @click="chooseImport">导入 JSON</el-button><el-button type="primary" @click="openEditor(null,true)">新建设计</el-button></div></div>
      <article class="panel theme-season-card" :class="{selected:isAuto}">
        <div class="theme-season-main">
          <div><h3>跟随季节</h3><p>春夏秋冬各有一套完整视觉，按站点所在地的日期自动轮换，不用手动切。</p></div>
          <p class="theme-season-now">当前：<strong>{{seasonHint||'…'}}</strong></p>
        </div>
        <div class="theme-season-actions">
          <span v-if="isAuto" class="theme-badge">正在使用</span>
          <el-button v-else type="primary" :loading="changing==='__auto__'" @click="followSeason">跟随季节</el-button>
        </div>
      </article>
      <div class="theme-grid"><article v-for="item in themes" :key="item.themeKey+'-'+item.version" class="panel theme-preview" :class="{selected:isActive(item)}">
        <div class="theme-card-live"><iframe loading="lazy" src="/theme-card-preview.html" :title="item.name+'实时预览'" @load="postCardPreview($event,item)"></iframe></div><div class="theme-info"><div><div class="theme-card-title"><h3>{{item.name}}</h3><small>{{item.builtin?(item.customizedCount?('系统主题 · 已自定义 '+item.customizedCount+' 项'):'系统主题 · 官方默认'):'我的主题'}} · v{{item.version}}</small></div><p>{{item.description}}</p></div><span v-if="isActive(item)" class="theme-badge">当前主题</span><span v-else-if="isAuto&&item.themeKey===siteState?.seasonThemeKey" class="theme-badge theme-badge--season">本季正在使用</span></div>
        <footer class="theme-card-actions"><el-button v-if="!isActive(item)" type="primary" :loading="changing===item.themeKey" @click="selectTheme(item)">使用</el-button><el-button @click="openEditor(item)">设计</el-button><el-button v-if="item.builtin&&item.customizedCount" @click="viewDiff(item)">查看修改</el-button><el-button v-if="item.builtin" :disabled="!item.customizedCount" @click="restoreOfficial(item)">还原默认</el-button><el-button v-if="!item.builtin" @click="duplicateTheme(item)">复制</el-button><el-button @click="exportTheme(item)">导出</el-button><el-button v-if="!item.builtin" type="danger" link @click="removeTheme(item)">删除</el-button></footer>
      </article></div>
      <el-dialog v-model="diffDialog" title="已修改的设置" width="min(640px,92vw)">
        <p v-if="!diffEntries.length" class="group-hint">还没有修改过任何设置——现在用的就是官方默认值。</p>
        <table v-else class="theme-diff-table"><tbody>
          <tr v-for="row in diffEntries" :key="row.label"><td>{{row.label}}</td><td><code>{{formatValue(row.oldValue)}}</code> → <code>{{formatValue(row.newValue)}}</code></td></tr>
        </tbody></table>
        <template #footer><el-button @click="diffDialog=false">关闭</el-button></template>
      </el-dialog>
      <el-dialog v-model="editor" class="theme-designer-dialog" :title="editingBuiltin?'设计系统主题 · '+form.name:(editing?'设计主题':'新建主题')" width="min(1240px,97vw)" destroy-on-close>
        <div class="theme-designer"><section class="theme-controls"><div class="theme-history"><el-button size="small" :disabled="!canUndo" @click="undo">撤销</el-button><el-button size="small" :disabled="!canRedo" @click="redo">重做</el-button><el-button size="small" @click="resetEditor">恢复打开时状态</el-button><el-button v-if="editingBuiltin" size="small" @click="restoreEditingOfficial">还原官方默认</el-button></div>
          <p v-if="editingBuiltin" class="group-hint">这是系统主题「{{form.name}}」，改动会叠加在官方默认值之上单独保存；名称和说明保持官方原样，随时可以「还原官方默认」清空你的修改。</p>
          <div class="theme-basic"><label>主题名称<el-input v-model="form.name" maxlength="100" :disabled="editingBuiltin"/></label><label>主题说明<el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" :disabled="editingBuiltin"/></label>
            <label>首页封面图
              <div class="hero-picker">
                <div class="hero-preview" :class="{empty:!heroUrl}" :style="heroUrl?{backgroundImage:'url('+heroUrl+')'}:null"><span v-if="!heroUrl">使用默认封面</span></div>
                <div class="hero-actions"><el-button size="small" :loading="heroUploading" @click="chooseHero">{{heroUrl?'更换封面':'上传封面'}}</el-button><el-button v-if="heroUrl" size="small" link type="danger" @click="clearHero">恢复默认</el-button></div>
                <input ref="heroInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="heroPicked">
                <small>显示在前台首页首屏右侧，建议横图；保存主题后生效。</small>
              </div>
            </label>
          </div>
          <div class="preset-row"><span class="preset-row-label">从预设开始</span><div class="preset-chips"><button v-for="item in builtinThemes" :key="item.themeKey" type="button" class="preset-chip" @click="applyPreset(item)"><i :style="presetSwatch(item)"></i><span>{{item.name}}</span></button></div></div>
          <details open><summary>色彩</summary>
            <label class="scheme-toggle">明暗基调<el-radio-group v-model="form.definitionJson.colors.scheme" size="small" @change="onFieldTouched({key:'colors',preview:'home'},{preview:'home'})"><el-radio-button value="light">亮色</el-radio-button><el-radio-button value="dark">暗色</el-radio-button></el-radio-group></label>
            <div class="theme-color-grid"><label v-for="item in colorFields" :key="item[0]"><span>{{item[1]}}</span><el-color-picker v-model="form.definitionJson.colors[item[0]]" @change="onFieldTouched({key:'colors',preview:'home'},{preview:'home'})"/><code>{{form.definitionJson.colors[item[0]]}}</code></label></div>
            <div class="contrast-note" :class="{warn:!contrast.ok}">正文与背景对比度 {{contrast.ratio}}:1 · {{contrast.ok?'阅读对比度良好':'建议达到 4.5:1 以上'}}</div>
          </details>
          <details v-for="group in basicGroups" :key="group.key"><summary>{{group.label}}</summary>
            <p v-if="group.hint" class="group-hint">{{group.hint}}</p>
            <div class="theme-setting-grid">
              <label v-for="field in group.fields" :key="field.key" class="setting-field" :class="{'is-disabled':fieldDisabled(field)}">
                <span class="setting-field-head"><span>{{field.label}}</span><small class="scene-badge">{{SCENE_LABEL[fieldScene(group,field)]}}<template v-if="field.target"> · {{field.target}}</template></small></span>
                <small v-if="field.help" class="field-help">{{field.help}}</small><small v-else aria-hidden="true" class="field-help field-help-placeholder">占位</small>
                <el-select v-if="field.type==='select'" v-model="form.definitionJson[group.key][field.key]" :disabled="fieldDisabled(field)" @change="onFieldTouched(group,field)"><el-option v-for="opt in field.options" :key="opt[0]" :label="opt[1]" :value="opt[0]"/></el-select>
                <el-input-number v-else-if="field.type==='number'" v-model="form.definitionJson[group.key][field.key]" :min="field.min" :max="field.max" :step="field.step" :disabled="fieldDisabled(field)" controls-position="right" @change="onFieldTouched(group,field)"/>
                <el-switch v-else-if="field.type==='switch'" v-model="form.definitionJson[group.key][field.key]" :disabled="fieldDisabled(field)" @change="onFieldTouched(group,field)"/>
                <el-color-picker v-else-if="field.type==='color'" v-model="form.definitionJson[group.key][field.key]" :disabled="fieldDisabled(field)" @change="onFieldTouched(group,field)"/>
              </label>
            </div>
          </details>
          <details class="advanced-toggle"><summary>高级效果</summary>
            <details v-for="group in advancedGroups" :key="group.key" class="advanced-group"><summary>{{group.label}}</summary>
              <p v-if="group.hint" class="group-hint">{{group.hint}}</p>
              <div class="theme-setting-grid">
                <label v-for="field in group.fields" :key="field.key" class="setting-field" :class="{'is-disabled':fieldDisabled(field)}">
                  <span class="setting-field-head"><span>{{field.label}}</span><small class="scene-badge">{{SCENE_LABEL[fieldScene(group,field)]}}<template v-if="field.target"> · {{field.target}}</template></small></span>
                  <small v-if="field.help" class="field-help">{{field.help}}</small><small v-else aria-hidden="true" class="field-help field-help-placeholder">占位</small>
                  <el-select v-if="field.type==='select'" v-model="form.definitionJson[group.key][field.key]" :disabled="fieldDisabled(field)" @change="onFieldTouched(group,field)"><el-option v-for="opt in field.options" :key="opt[0]" :label="opt[1]" :value="opt[0]"/></el-select>
                  <el-input-number v-else-if="field.type==='number'" v-model="form.definitionJson[group.key][field.key]" :min="field.min" :max="field.max" :step="field.step" :disabled="fieldDisabled(field)" controls-position="right" @change="onFieldTouched(group,field)"/>
                  <el-switch v-else-if="field.type==='switch'" v-model="form.definitionJson[group.key][field.key]" :disabled="fieldDisabled(field)" @change="onFieldTouched(group,field)"/>
                  <el-color-picker v-else-if="field.type==='color'" v-model="form.definitionJson[group.key][field.key]" :disabled="fieldDisabled(field)" @change="onFieldTouched(group,field)"/>
                </label>
              </div>
              <div v-if="group.key==='stickers'" class="sticker-editor">
                <article v-for="(item,index) in stickerItems" :key="index" class="sticker-row">
                  <img :src="stickerPreview(item.asset)" alt="">
                  <el-select v-model="item.asset" filterable @change="onFieldTouched(group,{preview:'journal'})">
                    <el-option-group v-for="pack in stickerAssets" :key="pack.group" :label="pack.group">
                      <el-option v-for="asset in pack.items" :key="asset[0]" :label="asset[1]" :value="asset[0]"/>
                    </el-option-group>
                  </el-select>
                  <el-select v-model="item.area" @change="onFieldTouched(group,{preview:'journal'})"><el-option v-for="area in stickerAreas" :key="area[0]" :label="area[1]" :value="area[0]"/></el-select>
                  <button type="button" class="danger" @click="removeSticker(index)">×</button>
                </article>
                <p v-if="!stickerItems.length" class="group-hint">还没有贴纸。加两三张就够了，页面留白本身也是内容。</p>
                <el-button plain size="small" :disabled="stickerItems.length>=10" @click="addSticker">＋ 添加贴纸</el-button>
              </div>
            </details>
          </details>
        </section><section class="theme-live"><header><span class="theme-live-title"><strong>网站实时预览</strong><small>固定示例数据</small></span><div><button type="button" :class="{active:previewMode==='desktop'}" @click="previewMode='desktop'">桌面</button><button type="button" :class="{active:previewMode==='mobile'}" @click="previewMode='mobile'">手机</button></div></header>
          <div class="theme-live-scenes">
            <button type="button" :class="{active:previewScene==='home'}" @click="previewScene='home'">首页</button>
            <button type="button" :class="{active:previewScene==='journal'}" @click="previewScene='journal'">日记</button>
            <button type="button" :class="{active:previewScene==='map'}" @click="previewScene='map'">地图</button>
          </div>
          <div ref="previewWrap" class="theme-frame-wrap" :class="previewMode"><div class="preview-stage" :style="stageStyle"><iframe ref="previewFrame" :style="frameStyle" :src="previewSrc" title="主题实时预览" @load="previewLoaded"></iframe></div></div></section></div>
        <template #footer><el-button @click="editor=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTheme">保存主题</el-button></template>
      </el-dialog>
    </div>`
  };

  /** 标签管理：改名、合并、删除，以及清理没有任何日记引用的标签。 */
  const Profile = {
    setup() {
      const avatarInput = ref(null);
      const uploading = ref(false);
      const changingPassword = ref(false);
      const password = reactive({ currentPassword:'', newPassword:'', confirmPassword:'' });
      const avatarUrl = computed(() => session.user?.avatarUrl);

      function chooseAvatar() { avatarInput.value?.click(); }
      async function picked(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        uploading.value = true;
        try {
          const form = new FormData();
          form.append('file', file);
          const updated = await api.auth.uploadAvatar(form);
          session.user = { ...session.user, ...updated };
          message('头像已更新');
        } catch (error) { fail(error); }
        finally {
          uploading.value = false;
          event.target.value = '';
        }
      }
      async function changePassword() {
        if (password.newPassword.length < 8) return fail(new Error('新密码至少需要 8 位'));
        if (password.newPassword !== password.confirmPassword) return fail(new Error('两次输入的新密码不一致'));
        changingPassword.value = true;
        try {
          await api.auth.changePassword({
            currentPassword: password.currentPassword,
            newPassword: password.newPassword
          });
          password.currentPassword = '';
          password.newPassword = '';
          password.confirmPassword = '';
          message('密码修改成功');
        } catch (error) { fail(error); }
        finally { changingPassword.value = false; }
      }
      // 昵称就地编辑：点一下变输入框，回车或失焦保存，Esc 放弃
      const editingName = ref(false);
      const nameDraft = ref('');
      const savingName = ref(false);
      function startEditName() { nameDraft.value = session.user?.displayName || ''; editingName.value = true; }
      function cancelEditName() { editingName.value = false; }
      async function saveName() {
        if (!editingName.value) return;
        const next = nameDraft.value.trim();
        if (!next) return fail(new Error('昵称不能为空'));
        if (next === session.user?.displayName) return cancelEditName();
        savingName.value = true;
        try {
          const updated = await api.auth.updateDisplayName({ displayName: next });
          session.user = { ...session.user, ...updated };
          editingName.value = false;
          message('昵称已更新');
        } catch (error) { fail(error); }
        finally { savingName.value = false; }
      }
      // 备份体积可能很大，用 a[download] 让浏览器直接接管下载，
      // 不经 axios 收进内存。会话 Cookie 会随普通导航一起带上。
      function download(includePhotos) {
        const link = document.createElement('a');
        link.href = A.backupUrl(includePhotos);
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        message('已开始导出，文件较大时请稍候');
      }
      return { session, avatarInput, avatarUrl, uploading, password, changingPassword, download, chooseAvatar, picked, changePassword,
               editingName, nameDraft, savingName, startEditName, cancelEditName, saveName };
    },
    template: `
      <div><div class="page-head"><div><h2>个人资料</h2><p>管理昵称、登录密码和网站展示头像。</p></div></div>
        <div class="profile-grid">
          <section class="panel panel-pad profile-card"><h3>头像与昵称</h3>
            <div class="profile-avatar"><img v-if="avatarUrl" :src="avatarUrl" alt="管理员头像"><span v-else>{{session.user?.displayName?.slice(0,1) || '旅'}}</span></div>
            <div class="profile-name">
              <div v-if="!editingName" class="profile-name-view"><strong>{{session.user?.displayName}}</strong><el-button link size="small" @click="startEditName">改昵称</el-button></div>
              <div v-else class="profile-name-edit"><el-input v-model="nameDraft" size="small" maxlength="60" show-word-limit placeholder="前台展示的昵称" @keyup.enter="saveName" @keyup.esc="cancelEditName"/><el-button link size="small" :loading="savingName" @click="saveName">保存</el-button><el-button link size="small" @click="cancelEditName">取消</el-button></div>
              <p>{{session.user?.username}}<small class="form-hint">登录用户名，不可修改</small></p>
            </div>
            <el-button type="primary" :loading="uploading" @click="chooseAvatar">上传新头像</el-button>
            <input ref="avatarInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="picked">
            <small>支持 JPEG、PNG、WebP，最大 5MB；上传后前台头像会同步更新。</small>
          </section>
          <section class="panel panel-pad password-card"><h3>修改密码</h3>
            <el-form label-position="top" @submit.prevent="changePassword">
              <el-form-item label="当前密码"><el-input v-model="password.currentPassword" type="password" show-password autocomplete="current-password"/></el-form-item>
              <el-form-item label="新密码"><el-input v-model="password.newPassword" type="password" show-password autocomplete="new-password" placeholder="至少 8 位"/></el-form-item>
              <el-form-item label="确认新密码"><el-input v-model="password.confirmPassword" type="password" show-password autocomplete="new-password"/></el-form-item>
              <el-button type="primary" :loading="changingPassword" @click="changePassword">确认修改</el-button>
            </el-form>
          </section>
          <section class="panel panel-pad backup-card"><h3>备份导出</h3>
            <p>把全部旅行、行程、预算和日记导出成一个 zip：每篇日记一份可恢复的 Block JSON，照片按日记分目录，另有 manifest.json 保存完整结构化数据。</p>
            <p class="backup-note">内容存在数据库和对象存储两处，导出是换服务器、换方案或哪天不想维护了的退路。建议定期存一份到本地。</p>
            <div class="backup-actions">
              <el-button type="primary" @click="download(true)">导出全部（含照片）</el-button>
              <el-button @click="download(false)">仅导出文字</el-button>
            </div>
          </section>
        </div>
      </div>`
  };

  const adminPages = document.getElementById('admin-app')?.[Symbol.for('travel-journal.admin-pages')];
  if (!adminPages?.createTagManagerPage) throw new Error('后台 SFC 页面注册不完整');
  const TagManager = adminPages.createTagManagerPage({
    message, fail, confirm,
    warning: text => ElementPlus.ElMessage.warning(text)
  });

  Object.assign(window.AdminPages, { TemplateManager, Theme, Profile, TagManager });
})();
