<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { CATALOG } from '@/journal/catalog'
import { createBlock, normalize } from '@/journal/document'
import { PREVIEW_SIZES, renderBlock } from '@/journal/render'
import { keepFitted } from '@/admin/fit-preview'
import { enhance, teardown } from '@/media/enhance'
import type { CatalogEntry, JournalBlock, JournalDocument } from '@/types/journal-block'
import type { MediaView } from '@/types/media'
import type { BlockEditorHandle, BlockUpload } from '@/admin/block-editor'
import type { BudgetSummary } from '@/api/budget'
import type { Trip } from '@/types/trip'

interface EditorItem {
  id?: number; label?: string; value?: string; text?: string; checked?: boolean; name?: string; role?: string
  note?: string; time?: string; title?: string; address?: string; description?: string; amount?: number; icon?: string
}
interface RelatedRecord {
  id: number; cityName?: string; arrivalDate?: string | null; formattedAddress?: string | null; regionName?: string | null
  expenseDate?: string; description?: string | null; merchant?: string | null; amount?: number | string; budgetCategoryId?: number | null
  itemDate?: string; startTime?: string | null; endTime?: string | null; title?: string; address?: string | null
  note?: string | null; type?: string; plannedCost?: number | string | null; tripStopId?: number | null
}
interface DataBinding { enabled: boolean; fields: string[]; source: string; selectedIds: number[]; recordId: number | null }
interface EditorData {
  [key: string]: unknown
  text: string; source: string; tone: string; icon: string; level: number
  items: Array<EditorItem|string>; pros: string[]; cons: string[]; headers: string[]; rows: string[][]
  categories: EditorItem[]; route: string[]; metrics: EditorItem[]
  url: string; title: string; description: string; score: number; max: number; comment: string
  date: string; city: string; tripTitle: string; weather: string; mood: string
  currency: string; total: number; name: string; address: string; hours: string; cost: string; impression: string
  dish: string; restaurant: string; price: string; rating: number; note: string; room: string; nights: number
  mode: string; from: string; to: string; number: string; duration: string
  condition: string; temperature: string; feelsLike: string; wind: string
  mediaId: number | null; mediaIds: number[]; caption: string; location: string; message: string; signature: string
  dayLabel: string; pendingKey?: string; pendingKeys?: string[]; pendingOrder?: string[]; pendingResolved?: Record<string, number>
}
interface EditorSettings {
  [key: string]: unknown
  style: string; align: string; layout: string; size: string; columns: number; ratio: string
  frame: string; radius: string; tone: string; effect: string; captionPos: string; dataBinding: DataBinding
}
interface EditorBlock extends Omit<JournalBlock, 'data' | 'settings'> { data: EditorData; settings: EditorSettings }
interface EditorDocument extends Omit<JournalDocument, 'blocks'> { blocks: EditorBlock[] }
interface TravelContext {
  trip?: Trip | null; stop?: RelatedRecord | null; stops?: RelatedRecord[]; itinerary?: RelatedRecord[]
  expenses?: RelatedRecord[]; budget?: BudgetSummary | null; occurredOn?: string
}
interface ScrollSnapshot { nodes: Array<{ node: HTMLElement, top: number, left: number }>; x: number; y: number }

function editorDocument(value: JournalDocument): EditorDocument { return value as EditorDocument }
function objectItems(value:Array<EditorItem|string>):EditorItem[]{return value.filter((item):item is EditorItem=>typeof item==='object'&&item!==null)}

  /** 区块列表里缩略展示的高度上限。原来是硬裁切，现在缩到这个高度以内，图片能看全。 */
  /** 区块列表里图片缩略的高度上限。竖图缩到 260 太小看不出内容，360 是能看清又不占满屏的折中。 */
  const BLOCK_PREVIEW_MAX_HEIGHT=360;
  const JB={CATALOG,createBlock,normalize,renderBlock};
  const IMAGE_BLOCKS=['image','gallery','postcard'];
  const LINKABLE_BLOCKS=['trip-info','route','itinerary','timeline','expense-summary','location-card','food','stay','transport',
    'day-opener','day-summary'];
  // 这四种是「一边想一边打字」的内容，直接在正文里编辑；其余的是要填表的，仍然走配置弹窗。
  const INLINE_BLOCKS=['paragraph','heading','quote','callout'];
  // 手机上按 ＋ 先看到的是这几个，不是全部类型。正文直接写，另起组件用「＋正文」。
  const QUICK_BLOCKS=['image','chapter','location-card','heading','day-opener','gallery','day-summary','divider'];
  const PLACEHOLDERS={paragraph:'继续写……',heading:'小标题',quote:'想记住的一句话',callout:'写下这条提示'};
  const CALLOUT_TONES=[['note','心得'],['tip','提示'],['warning','提醒'],['memory','记忆']] as const;
  // textarea 跟着内容长高，让正文看起来是连续的一篇，而不是一格格输入框
  const autoGrow=(el:Element|null)=>{if(!(el instanceof HTMLTextAreaElement))return;el.style.height='auto';el.style.height=el.scrollHeight+'px';};
  const vGrow={mounted:autoGrow,updated:autoGrow};

  const props=withDefaults(defineProps<{modelValue:JournalDocument,media?:MediaView[],travelContext?:TravelContext,uploads?:BlockUpload[],notify?:(text:string)=>void}>(),{media:()=>[],travelContext:()=>({}),uploads:()=>[],notify:()=>undefined});
  const emit=defineEmits<{(event:'update:modelValue',value:JournalDocument):void;(event:'retry-upload',key:string):void;(event:'discard-upload',key:string):void}>();
      const document=ref<EditorDocument>(editorDocument(JB.normalize(props.modelValue)));
      const catalogOpen=ref(false),editorOpen=ref(false),draft=ref<EditorBlock|null>(null),editIndex=ref(-1),insertAt=ref(0);
      const query=ref(''),activeCategory=ref('全部'),imageTab=ref('content'),previewEl=ref<HTMLElement|null>(null);
      const catalogMode=ref('quick'),catalogCount=JB.CATALOG.length,focusedIndex=ref(-1);
      const quickItems=QUICK_BLOCKS.map(type=>JB.CATALOG.find(x=>x.type===type)).filter((item):item is CatalogEntry=>Boolean(item));
      const categories=['全部',...new Set(JB.CATALOG.map(x=>x.category))];
      const filtered=()=>JB.CATALOG.filter(x=>(activeCategory.value==='全部'||x.category===activeCategory.value)
        &&(!query.value||[x.label,x.description,x.category].join(' ').includes(query.value)));
      const isImageBlock=computed(()=>draft.value!==null&&IMAGE_BLOCKS.includes(draft.value.type));
      /*
       * 配置弹窗里的「正文效果」只有一两百像素宽。
       *
       * 不给尺寸提示的话，它会沿用正文那套 92vw，浏览器按手机屏幕算出上千设备像素、
       * 转头去下 1280 那一档——为了画这么小一块预览解码一整张大图，打开弹窗时就是
       * 明显的一下卡顿。
       */
      const draftPreview=computed(()=>draft.value?JB.renderBlock(draft.value,props.media,{sizes:PREVIEW_SIZES}):'');
      const layoutUsesColumns=computed(()=>draft.value?.type==='gallery'&&['grid','masonry'].includes(draft.value.settings?.layout));
      const layoutUsesRatio=computed(()=>draft.value!==null&&draft.value.type!=='postcard'&&(
        draft.value.type==='image'||['grid','row','mosaic','magazine','carousel','filmstrip','compare'].includes(draft.value.settings.layout)));
      const alignAvailable=computed(()=>draft.value===null||!['full','bleed'].includes(draft.value.settings.size));
      const isLinkableBlock=computed(()=>draft.value!==null&&LINKABLE_BLOCKS.includes(draft.value.type));
      const hasTravelContext=computed(()=>props.travelContext?.trip?.id!=null);
      const emptyBinding:DataBinding={enabled:false,fields:[],source:'stops',selectedIds:[],recordId:null};
      const dataBinding=computed<DataBinding>(()=>draft.value?.settings?.dataBinding||emptyBinding);
      const relatedRecords=computed<RelatedRecord[]>(()=>{
        const context=props.travelContext||{},type=draft.value?.type,binding=dataBinding.value;
        if(type==='route')return (binding?.source==='itinerary'?(context.itinerary||[]):(context.stops||[])) as RelatedRecord[];
        if(type&&['itinerary','timeline'].includes(type))return (context.itinerary||[]) as RelatedRecord[];
        if(type==='expense-summary')return (context.expenses||[]) as RelatedRecord[];
        if(type==='location-card')return (context.stops||[]) as RelatedRecord[];
        if(type==='food')return (context.itinerary||[]).filter(item=>item.type==='FOOD') as RelatedRecord[];
        if(type==='stay')return (context.itinerary||[]).filter(item=>item.type==='HOTEL') as RelatedRecord[];
        if(type==='transport')return (context.itinerary||[]).filter(item=>item.type==='TRANSPORT') as RelatedRecord[];
        return [];
      });
      const imageModeHint=computed(()=>{
        if(draft.value?.type==='postcard')return '明信片使用固定的“照片 + 手写寄语”结构，只需填写内容。';
        const layout=draft.value?.settings?.layout;
        const hints:Record<string,string>={grid:'规则网格：列数和裁切比例会生效。',row:'横向并排：照片等高排列，列数不参与计算。',masonry:'瀑布流：保留照片原始比例，只使用列数。',mosaic:'拼贴：第一张作为主图，显示比例会影响其余照片。',magazine:'杂志：根据图片数量自动安排大小，列数不参与计算。',story:'故事流：照片上下交错并保留原始比例。',staggered:'错落画廊：自动改变宽度和左右位置。',carousel:'轮播：每次展示一张，使用显示比例。',filmstrip:'胶片条：横向滚动，使用显示比例。',compare:'前后对比：只使用前两张图片。'};
        return draft.value?.type==='gallery'?(hints[layout||'']||'选择一种图片组排版。'):'单张图片会按照正文栏宽度计算大小。';
      });
      let syncing=false,inlineTimer:number|null=null,ensureTimer:number|null=null,caretTimer:number|null=null,viewportFrame:number|null=null,lastViewportMetrics='';
      let selectScrollSnapshot:ScrollSnapshot|null=null;

      function bindingDefaults(type:string):DataBinding{
        const defaults:DataBinding={enabled:false,fields:[],source:'stops',selectedIds:[],recordId:null};
        if(type==='trip-info')return{...defaults,fields:['date','city','tripTitle']};
        if(type==='route')return defaults;
        if(['itinerary','timeline','expense-summary'].includes(type))return defaults;
        // 开场卡和小结默认就开着关联：它们要的东西——城市、第几天、路线、花费——
        // 全都已经在旅行工作台里了，让作者再抄一遍没有意义
        if(['day-opener','day-summary'].includes(type))return{...defaults,enabled:true};
        return defaults;
      }
      function ensureBinding(){
        if(!draft.value||!LINKABLE_BLOCKS.includes(draft.value.type))return;
        draft.value.settings=draft.value.settings||{};
        draft.value.settings.dataBinding=Object.assign(bindingDefaults(draft.value.type),draft.value.settings.dataBinding||{});
        // 默认就开着关联的块（开场卡、小结）要立刻填一次，否则弹窗打开是空的
        if(draft.value.settings.dataBinding.enabled&&hasTravelContext.value){initializeBindingSelection();applyBinding();}
      }
      /** 这两种块不挑具体记录，它们要的是「这一天的全部」，所以没有可选列表。 */
      function bindsWholeDay(type:string){return ['day-opener','day-summary'].includes(type);}
      function shortTime(value:unknown){return value?String(value).slice(0,5):'';}
      function recordLabel(item:RelatedRecord){
        if(!item)return'';
        if(draft.value?.type==='expense-summary')return [item.expenseDate,item.description||item.merchant,'¥'+item.amount].filter(Boolean).join(' · ');
        if(draft.value?.type==='route'&&dataBinding.value?.source!=='itinerary')return [item.cityName,item.arrivalDate].filter(Boolean).join(' · ');
        if(draft.value?.type==='location-card')return [item.cityName,item.formattedAddress||item.regionName].filter(Boolean).join(' · ');
        return [item.itemDate,shortTime(item.startTime),item.title,item.address].filter(Boolean).join(' · ');
      }
      function initializeBindingSelection(){
        const binding=dataBinding.value,context=props.travelContext||{};if(!binding)return;
        const block=draft.value;if(!block)return;
        if(block.type==='trip-info'||bindsWholeDay(block.type))return;
        const records=relatedRecords.value;
        if(['route','itinerary','timeline','expense-summary'].includes(block.type)){
          if(binding.selectedIds?.length)return;
          let preferred=records;
          if(block.type!=='route'&&context.occurredOn){
            const dateKey:'expenseDate'|'itemDate'=block.type==='expense-summary'?'expenseDate':'itemDate';
            const sameDay=records.filter(item=>item[dateKey]===context.occurredOn);if(sameDay.length)preferred=sameDay;
          }
          binding.selectedIds=preferred.map(item=>item.id);
        }else if(binding.recordId==null){
          const currentStop=block.type==='location-card'&&context.stop
            ? records.find(item=>Number(item.id)===Number(context.stop?.id)):null;
          binding.recordId=(currentStop||records[0])?.id||null;
        }
      }
      /** 这一天是这次旅行的第几天。旅行没填开始日期时不猜，直接留空。 */
      function dayLabel(context:TravelContext){
        const start=context.trip?.startDate,day=context.occurredOn;
        if(!start||!day)return '';
        const diff=Math.round((new Date(day).getTime()-new Date(start).getTime())/86400000);
        return diff>=0?('Day '+(diff+1)):'';
      }
      /** 当天的行程按时间排一遍，取出经过的地方——就是开场卡上那行「浅草 → 上野 → 银座」。 */
      function dayRoute(context:TravelContext){
        const day=context.occurredOn;
        return (context.itinerary||[])
          .filter(item=>!day||item.itemDate===day)
          .slice().sort((a,b)=>String(a.startTime||'').localeCompare(String(b.startTime||'')))
          .map(item=>item.title).filter(Boolean);
      }
      /** 当天花了多少。没有账目就返回 null，让调用方决定要不要显示这一项。 */
      function daySpend(context:TravelContext){
        const day=context.occurredOn;
        const items=(context.expenses||[]).filter(item=>!day||item.expenseDate===day);
        if(!items.length)return null;
        const total=items.reduce((sum,item)=>sum+(Number(item.amount)||0),0);
        const currency=context.budget?.currency||context.trip?.defaultCurrency||'CNY';
        return (currency==='CNY'?'¥ ':currency+' ')+total.toLocaleString('zh-CN',{maximumFractionDigits:2});
      }
      function applyBinding(){
        const binding=dataBinding.value,block=draft.value,context=props.travelContext||{};
        if(!binding?.enabled||!block)return;
        const data=block.data;
        /*
         * 今日开场卡。
         *
         * 城市、第几天、日期、路线、花费全都能从旅行数据推出来，所以这里一次性填齐。
         * 天气不动——它没有数据源，是作者自己写的那一个字。
         */
        if(block.type==='day-opener'){
          data.city=context.stop?.cityName||context.trip?.title||'';
          data.dayLabel=dayLabel(context);
          data.date=context.occurredOn||'';
          data.route=dayRoute(context).filter((item):item is string=>Boolean(item));
          const spend=daySpend(context);
          // 只覆盖自动算得出的那几项，作者手填的数字（步数之类）留着
          const manual=data.metrics.filter(item=>item&&item.label!=='花费');
          data.metrics=spend?[...manual,{value:spend,label:'花费'}]:manual;
          return;
        }
        /* 今日小结：能自动填的只有花费，其余几项是作者对这一天的判断，只把位置准备好。 */
        if(block.type==='day-summary'){
          const items=data.items.filter((item):item is EditorItem=>typeof item==='object'&&item!==null&&item.label!=='今日花费');
          const spend=daySpend(context);
          data.items=spend?[...items,{icon:'💴',label:'今日花费',value:spend}]:items;
          return;
        }
        if(block.type==='trip-info'){
          const fields=binding.fields||[];
          if(fields.includes('date'))data.date=context.occurredOn||'';
          if(fields.includes('city'))data.city=context.stop?.cityName||'';
          if(fields.includes('tripTitle'))data.tripTitle=context.trip?.title||'';
          return;
        }
        const selectedIds=new Set((binding.selectedIds||[]).map(Number));
        const selected=relatedRecords.value.filter(item=>selectedIds.has(Number(item.id)));
        if(block.type==='route'){
          data.items=selected.map(item=>binding.source==='itinerary'?item.title:item.cityName).filter((item):item is string=>Boolean(item));return;
        }
        if(['itinerary','timeline'].includes(block.type)){
          data.items=selected.map(item=>({time:shortTime(item.startTime),title:item.title||'',address:item.address||'',description:item.note||''}));return;
        }
        if(block.type==='expense-summary'){
          const categoryNames=new Map((context.budget?.categories||[]).map(item=>[Number(item.id),item.name]));
          const groups=new Map<string,number>();let total=0;
          selected.forEach(item=>{const amount=Number(item.amount)||0,name=categoryNames.get(Number(item.budgetCategoryId))||'其他';total+=amount;groups.set(name,(groups.get(name)||0)+amount);});
          data.currency=context.budget?.currency||context.trip?.defaultCurrency||'CNY';data.total=Number(total.toFixed(2));
          data.categories=Array.from(groups,([name,amount])=>({name,amount:Number(amount.toFixed(2))}));return;
        }
        const item=relatedRecords.value.find(record=>Number(record.id)===Number(binding.recordId));if(!item)return;
        if(block.type==='location-card')Object.assign(data,{name:item.cityName||'',address:item.formattedAddress||item.regionName||'',impression:item.note||''});
        if(block.type==='food')Object.assign(data,{dish:item.title||'',restaurant:item.address||'',price:item.plannedCost?String(item.plannedCost):'',note:item.note||''});
        if(block.type==='stay')Object.assign(data,{name:item.title||'',room:item.address||'',note:item.note||''});
        if(block.type==='transport')Object.assign(data,{mode:item.title||'交通',from:context.stops?.find(stop=>Number(stop.id)===Number(item.tripStopId))?.cityName||'',to:item.address||'',duration:[shortTime(item.startTime),shortTime(item.endTime)].filter(Boolean).join('–'),note:item.note||''});
      }
      function onBindingModeChange(enabled:boolean){if(enabled){initializeBindingSelection();applyBinding();}}
      function onBindingSourceChange(){if(dataBinding.value)dataBinding.value.selectedIds=[];initializeBindingSelection();applyBinding();}
      function refreshBinding(){initializeBindingSelection();applyBinding();props.notify('已同步当前旅行数据');}

      watch(()=>props.modelValue,value=>{
        // 正文里有还没提交的击键时不接受回流，否则光标下的那段字会被旧快照顶掉
        if(syncing||inlineTimer)return;
        const incoming=editorDocument(JB.normalize(value));
        if(JSON.stringify(incoming)!==JSON.stringify(document.value))document.value=incoming;
      },{deep:true});
      /*
       * 缩放必须和内容更新落在同一帧。
       *
       * flush:'post' 已经保证 DOM 更新完才跑，再套一层 nextTick 等于把重算又推迟一个微任务。
       * 这期间宿主 div 上仍挂着按旧版式算出的 transform 和负 marginBottom，新内容配着旧缩放
       * 参数——改版式时看到的那一下跳动就是它。负 marginBottom 尤其明显：从大图切回小图，
       * 小小的内容上还带着几百像素的负边距，下方元素先被拽上去再弹回。
       *
       * 只有 scale 跨越 1 ↔ <1 时才看得见：小图和中等都放得下（scale=1），互相切换没有
       * 参数变化，所以不闪。
       *
       * nextTick 不能直接删掉——弹窗首次打开时 el-dialog 的内容还没挂载，previewEl 是 null，
       * 那种情况仍得等下一拍。
       */
      watch([draftPreview,editorOpen],()=>{
        const run=()=>{if(editorOpen.value&&previewEl.value){enhance(previewEl.value);fitDialogPreview();}};
        run();
        if(!previewEl.value)nextTick(run);
      },{flush:'post'});

      /*
       * 预览等比缩放。
       *
       * 图片区块的高度随版式差好几倍，而预览区是固定高度的，大图必然溢出——要滚动才能看完
       * 的预览等于没有预览。限制图片最大高度更省事，但那样「大图」和「中等」看起来一模一样，
       * 预览也就没意义了。等比缩放保留全部比例，只是整体小一号。
       */
      let releaseDialogFit:(()=>void)|null=null;
      function fitDialogPreview(){
        releaseDialogFit?.();
        releaseDialogFit=previewEl.value?keepFitted(previewEl.value):null;
      }

      /** 区块列表里每张缩略图各自缩放；容器高度跟着缩放后的实际高度走，不留空。 */
      const blockFits=new Map<string,()=>void>();
      function bindBlockPreview(el:Element|ComponentPublicInstance|null,blockId:string){
        blockFits.get(blockId)?.();
        blockFits.delete(blockId);
        if(el instanceof HTMLElement)blockFits.set(blockId,keepFitted(el,{max:BLOCK_PREVIEW_MAX_HEIGHT}));
      }
      // 弹窗开合的那一刻就把 inset 调整到位，别等下一次 visualViewport 事件
      watch([editorOpen,catalogOpen],()=>viewport());
      watch(editorOpen,()=>{
        // 弹窗有淡入淡出，渲染完那一帧之后浏览器还可能再滚一次，所以补一帧
        void nextTick(()=>{restorePageScroll();requestAnimationFrame(restorePageScroll);});
      });
      watch(()=>dataBinding.value?.selectedIds,()=>applyBinding(),{deep:true});
      watch(()=>dataBinding.value?.recordId,()=>applyBinding());
      watch(()=>dataBinding.value?.fields,()=>applyBinding(),{deep:true});
      watch(()=>props.travelContext,()=>{if(hasTravelContext.value)applyBinding();},{deep:true});
      function commit(){
        syncing=true;
        const value=editorDocument(JB.normalize(document.value));
        document.value=value;emit('update:modelValue',value);
        nextTick(()=>syncing=false);
      }
      /**
       * 打字时不要每一键都 commit——那会让父组件重算整篇文档，光标很容易被顶走。
       * 攒 300 毫秒再往上报一次；结构变化（新增正文组件、退格合并）走 flushInline 立即提交。
       */
      function scheduleCommit(){
        if(inlineTimer)clearTimeout(inlineTimer);
        inlineTimer=window.setTimeout(()=>{inlineTimer=null;commit();},300);
      }
      function flushInline(){
        if(inlineTimer){clearTimeout(inlineTimer);inlineTimer=null;}
        commit();
      }
      function isInline(type:string){return INLINE_BLOCKS.includes(type);}
      /** 文档里有没有能直接落笔的组件（正文、小标题、引用、提示卡）。 */
      const hasWritableBlock=computed(()=>document.value.blocks.some(block=>isInline(block.type)));
      function placeholderOf(block:EditorBlock){return PLACEHOLDERS[block.type as keyof typeof PLACEHOLDERS]||'';}
      function inlineInput(event:Event){const target=event.target as HTMLTextAreaElement;autoGrow(target);scheduleCommit();keepInlineCaretVisible(target,60);}
      function inlineFocus(index:number,event:FocusEvent){focusedIndex.value=index;keepInlineCaretVisible(event.target as HTMLTextAreaElement,180);}
      /** 底部工具栏用：新内容落在光标所在段落之后，而不是一律追加到文末。 */
      function insertQuick(type:string){
        const item=JB.CATALOG.find(x=>x.type===type);if(!item)return;
        insertAt.value=focusedIndex.value>=0&&focusedIndex.value<document.value.blocks.length
          ? focusedIndex.value+1 : document.value.blocks.length;
        choose(item);
      }
      /** 把光标放到某个块里。caret 支持 'start'、'end' 或具体下标。 */
      function focusInline(blockId:string,caret:'start'|'end'|number){
        nextTick(()=>{
          const el=window.document.querySelector<HTMLTextAreaElement>('[data-inline-input="'+blockId+'"]');
          if(!el)return;
          autoGrow(el);el.focus({preventScroll:true});
          const pos=caret==='end'?el.value.length:(caret==='start'||caret==null?0:Math.min(caret,el.value.length));
          el.setSelectionRange(pos,pos);
          el.scrollIntoView({block:'nearest'});
          keepInlineCaretVisible(el,180);
        });
      }
      /**
       * 回车交还给 textarea，手机软键盘和普通文本编辑器一样插入段内换行。
       * 新建正文块改由每个组件下方的显式按钮完成，避免作者只是想换行却意外拆块。
       */
      function insertParagraph(index:number){
        const block=JB.createBlock('paragraph') as EditorBlock;
        document.value.blocks.splice(index+1,0,block);
        flushInline();focusInline(block.id,'start');
      }
      /** 在块首退格＝和上一段合并，这样删掉多余的空段落不用去点删除按钮。 */
      function inlineBackspace(event:KeyboardEvent,index:number){
        const el=event.target as HTMLTextAreaElement;
        if(el.selectionStart!==0||el.selectionEnd!==0||index===0)return;
        const previous=document.value.blocks[index-1];
        if(!previous||!isInline(previous.type))return;
        event.preventDefault();
        const current=document.value.blocks[index];if(!current)return;
        const tail=String(current.data.text||'');
        const caret=String(previous.data.text||'').length;
        previous.data.text=String(previous.data.text||'')+tail;
        document.value.blocks.splice(index,1);
        flushInline();focusInline(previous.id,caret);
      }
      /** 光标已经在首行/末行时，上下键跨到相邻段落，正文读起来才是一整篇。 */
      function inlineArrow(event:KeyboardEvent,index:number,step:number){
        const el=event.target as HTMLTextAreaElement;
        if(step<0?el.selectionStart!==0:el.selectionEnd!==el.value.length)return;
        const target=document.value.blocks[index+step];
        if(!target||!isInline(target.type))return;
        event.preventDefault();focusInline(target.id,step<0?'end':'start');
      }
      /** 空日记里的那个占位输入框：一打字才真正建出第一个段落，没写就退出不会留下空区块。 */
      function startWriting(event:Event){
        const target=event.target as HTMLTextAreaElement,text=target.value;
        target.value='';
        if(!text)return;
        const block=JB.createBlock('paragraph',{text:text}) as EditorBlock;
        document.value.blocks.push(block);commit();focusInline(block.id,'end');
      }
      function setHeadingLevel(block:EditorBlock,level:number){block.data.level=level;flushInline();}
      function setCalloutTone(block:EditorBlock,tone:string){block.data.tone=tone;flushInline();}
      function openCatalog(index?:number){
        insertAt.value=index==null?document.value.blocks.length:index;
        query.value='';activeCategory.value='全部';catalogMode.value='quick';catalogOpen.value=true;
      }
      function choose(item:CatalogEntry){
        catalogOpen.value=false;draft.value=JB.createBlock(item.type) as EditorBlock;editIndex.value=-1;
        if(item.type==='divider'){confirmEdit();return;}
        // 小标题和引用不该再弹一次表单——直接落在正文里开始打字
        if(isInline(item.type)){
          const block=draft.value;draft.value=null;
          document.value.blocks.splice(insertAt.value,0,block);
          commit();focusInline(block.id,'start');return;
        }
        ensureBinding();
        imageTab.value='content';
        nextTick(()=>editorOpen.value=true);
      }
      function edit(index:number){
        const block=document.value.blocks[index];if(!block)return;
        pinPageScroll();
        draft.value=JSON.parse(JSON.stringify(block)) as EditorBlock;
        editIndex.value=index;ensureBinding();imageTab.value='content';
        /*
         * 弹窗不再 destroy-on-close，DOM 会复用——每次打开都重建整棵内容树（四个 Tab、
         * 表单、图片选择器、预览纸张）正是打开时那一下闪的来源。代价是上一次的状态会留下，
         * 所以这里显式清干净：Tab 已经在上面重置了，滚动位置在弹窗渲染完之后归零。
         */
        editorOpen.value=true;
        void nextTick(()=>{
          const form=window.document.querySelector('.block-config-dialog .block-config-form');
          if(form)form.scrollTop=0;
          const tabs=window.document.querySelector('.image-setting-tabs>.el-tabs__content');
          if(tabs)tabs.scrollTop=0;
        });
      }
      /*
       * 手机上单击就打开配置，桌面仍然是双击。
       *
       * 双击在移动端不只是「两次点击」：浏览器要先等一段时间判断这是不是 double-tap-to-zoom，
       * 期间还可能真的动一下视口缩放。配合 CSS 的 touch-action:manipulation 把这套手势关掉，
       * 双击带来的那一下抖动就从根上没有了。桌面保留双击是因为鼠标点一下常常只是想定位，
       * 单击即弹窗会很吵。
       */
      const coarsePointer=window.matchMedia?.('(pointer: coarse)').matches??false;
      function isInteractive(target:EventTarget|null){
        return target instanceof Element&&!!target.closest('button,a,input,textarea,select,[role="button"]');
      }
      function openConfigOnTap(event:MouseEvent,index:number){
        if(!coarsePointer||isInteractive(event.target))return;
        edit(index);
      }
      function editOnDoubleClick(event:MouseEvent,index:number){
        if(coarsePointer||isInteractive(event.target))return;
        edit(index);
      }

      /*
       * 弹窗开合前后把编辑器的滚动位置钉住。
       *
       * 弹窗一开一关会引起焦点转移、软键盘收放和 body overflow 变化，浏览器顺手滚一下
       * .editor-page 是常事——对作者来说就是「点开图片再关掉，正文跑到别处去了」。
       * 记住开之前的位置，等弹窗渲染完再放回去。
       */
      let pinnedScrollTop=0;
      function editorPage(){return window.document.querySelector<HTMLElement>('.editor-page');}
      function pinPageScroll(){pinnedScrollTop=editorPage()?.scrollTop??0;}
      function restorePageScroll(){
        const page=editorPage();
        if(!page)return;
        // 差一两像素是正常的舍入，不值得写回去再触发一次滚动
        if(Math.abs(page.scrollTop-pinnedScrollTop)>2)page.scrollTop=pinnedScrollTop;
      }
      function backToCatalog(){editorOpen.value=false;draft.value=null;nextTick(()=>catalogOpen.value=true);}
      function confirmEdit(){
        if(!draft.value)return;
        const block=JSON.parse(JSON.stringify(draft.value)) as EditorBlock;
        let index=editIndex.value;
        if(index>=0)document.value.blocks.splice(index,1,block);
        else{index=insertAt.value;document.value.blocks.splice(index,0,block);}
        editorOpen.value=false;commit();
        if(window.document.activeElement instanceof HTMLElement)window.document.activeElement.blur();
        nextTick(()=>setTimeout(()=>window.document.querySelector('[data-editor-block-id="'+block.id+'"]')
          ?.scrollIntoView({behavior:'smooth',block:'center'}),80));
      }
      function remove(index:number){
        const previous=document.value.blocks[index-1];
        document.value.blocks.splice(index,1);flushInline();
        if(previous&&isInline(previous.type))focusInline(previous.id,'end');
      }
      function move(index:number,offset:number){
        const target=index+offset;if(target<0||target>=document.value.blocks.length)return;
        const item=document.value.blocks.splice(index,1)[0];if(item)document.value.blocks.splice(target,0,item);commit();
      }
      function addRow(field:string,value:unknown){const block=draft.value;if(!block)return;const rows=block.data[field];if(!Array.isArray(rows))block.data[field]=[];(block.data[field] as unknown[]).push(value);}
      function removeRow(field:string,index:number){const block=draft.value;if(!block)return;const rows=block.data[field];if(Array.isArray(rows))rows.splice(index,1);}
      function addTableColumn(){const block=draft.value;if(!block)return;block.data.headers.push('新列');block.data.rows.forEach(row=>row.push(''));}
      function removeTableColumn(index:number){const block=draft.value;if(!block||block.data.headers.length<=1)return;block.data.headers.splice(index,1);block.data.rows.forEach(row=>row.splice(index,1));}
      function addTableRow(){const block=draft.value;if(block)block.data.rows.push(block.data.headers.map(()=>''));}
      /** 区块列表里的缩略展示，同样是小尺寸，不该按正文宽度挑图。 */
      function render(block:EditorBlock){return JB.renderBlock(block,props.media,{sizes:PREVIEW_SIZES});}
      function label(type:string){return JB.CATALOG.find(x=>x.type===type)?.label||type;}
      function isMediaType(type:string){return IMAGE_BLOCKS.includes(type);}
      function ensureVisible(event?:FocusEvent){
        const el=(event?.target||window.document.activeElement) as Element|null;if(!el)return;
        if(ensureTimer)clearTimeout(ensureTimer);
        ensureTimer=window.setTimeout(()=>{
          ensureTimer=null;
          if(el.isConnected)el.scrollIntoView({block:'center',behavior:'smooth'});
        },120);
      }
      /**
       * textarea 会随正文长高，元素本身可能跨过整个手机屏幕；只对元素做 scrollIntoView
       * 不能保证中间某一行的光标可见。用同样字号和宽度做一个隐藏镜像，算出真实光标行。
       */
      function inlineCaretRect(textarea:HTMLTextAreaElement){
        const style=window.getComputedStyle(textarea),rect=textarea.getBoundingClientRect();
        const mirror=window.document.createElement('div');
        Object.assign(mirror.style,{position:'fixed',left:'-10000px',top:'0',visibility:'hidden',
          boxSizing:'border-box',width:rect.width+'px',whiteSpace:'pre-wrap',overflowWrap:'break-word',
          wordBreak:style.wordBreak,padding:style.padding,border:style.border,
          font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,
          textIndent:style.textIndent,textTransform:style.textTransform,wordSpacing:style.wordSpacing,
          tabSize:style.tabSize});
        mirror.textContent=textarea.value.slice(0,textarea.selectionStart||0);
        const marker=window.document.createElement('span');marker.textContent='\u200b';mirror.appendChild(marker);
        window.document.body.appendChild(mirror);
        const lineHeight=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.5||24;
        const top=rect.top+marker.offsetTop-textarea.scrollTop;
        mirror.remove();
        return{top,bottom:top+lineHeight};
      }
      /** 键盘展开或光标移动后，把光标行放进顶栏与键盘/工具栏之间的可见区域。 */
      function keepInlineCaretVisible(textarea:HTMLTextAreaElement,delay=0){
        if(!textarea.matches('[data-inline-input]'))return;
        if(caretTimer)clearTimeout(caretTimer);
        caretTimer=window.setTimeout(()=>{
          caretTimer=null;if(!textarea.isConnected||window.document.activeElement!==textarea)return;
          const vv=window.visualViewport,viewportTop=vv?.offsetTop||0;
          const viewportBottom=viewportTop+(vv?.height||window.innerHeight);
          const toolbar=window.document.querySelector('.editor-toolbar'),toolbarRect=toolbar?.getBoundingClientRect();
          const toolbarTop=toolbarRect&&toolbarRect.top>viewportTop&&toolbarRect.top<viewportBottom
            ? toolbarRect.top:viewportBottom;
          const visibleTop=viewportTop+62,visibleBottom=Math.min(viewportBottom,toolbarTop)-18;
          const caret=inlineCaretRect(textarea),scroller=textarea.closest('.editor-page');
          if(!scroller||visibleBottom<=visibleTop)return;
          if(caret.bottom>visibleBottom)scroller.scrollTop+=caret.bottom-visibleBottom+20;
          else if(caret.top<visibleTop)scroller.scrollTop-=visibleTop-caret.top+12;
        },delay);
      }
      function onSelectionChange(){
        const active=window.document.activeElement;
        if(active instanceof HTMLTextAreaElement&&active.matches('[data-inline-input]'))keepInlineCaretVisible(active,60);
      }
      /** 下拉打开前记住所有祖先滚动区；选完后恢复，避免表单被顶上去后停在新位置。 */
      function rememberSelectScroll(event:PointerEvent){
        const select=(event.target as Element).closest('.el-select');
        if(!select)return;
        const nodes:HTMLElement[]=[];
        for(let node=select.parentElement;node&&node!==window.document.body;node=node.parentElement){
          const overflow=window.getComputedStyle(node).overflowY;
          if(/auto|scroll/.test(overflow)&&!nodes.includes(node))nodes.push(node);
        }
        selectScrollSnapshot={nodes:nodes.map(node=>({node,top:node.scrollTop,left:node.scrollLeft})),
          x:window.scrollX,y:window.scrollY};
      }
      function restoreSelectScroll(){
        const snapshot=selectScrollSnapshot;if(!snapshot)return;
        selectScrollSnapshot=null;
        if(ensureTimer){clearTimeout(ensureTimer);ensureTimer=null;}
        const restore=()=>{
          snapshot.nodes.forEach(item=>{if(item.node.isConnected){item.node.scrollTop=item.top;item.node.scrollLeft=item.left;}});
          window.scrollTo(snapshot.x,snapshot.y);
        };
        nextTick(()=>requestAnimationFrame(()=>{restore();setTimeout(restore,100);}));
      }
      function onDocumentClick(event:MouseEvent){
        if(!selectScrollSnapshot)return;
        const target=event.target as Element;
        if(target.closest('.el-select-dropdown__item'))restoreSelectScroll();
        else if(!target.closest('.el-select,.el-select__popper'))restoreSelectScroll();
      }
      function applyViewport(){
        viewportFrame=null;
        const vv=window.visualViewport,bottom=vv?Math.max(0,window.innerHeight-vv.height-vv.offsetTop):0;
        /*
         * 弹窗盖住整个编辑器时，底部 inset 冻结成 0。
         *
         * 打开弹窗会让 body 的 overflow 变化，移动浏览器顺势收起或展开地址栏，
         * visualViewport 跟着变一次 —— 而 .editor-page 的 padding-bottom 和固定底栏
         * .editor-toolbar 的 bottom 都挂在 --browser-bottom-inset 上，于是背后那一整页
         * 在弹窗弹出的同一帧里重排，看起来就是「双击图片，页面闪一下」。
         *
         * 弹窗此刻盖住了工具栏，本来也不需要为浏览器底栏留位置；它自己靠
         * --visual-viewport-height 适配软键盘，那个仍然照常更新。
         */
        const sheetOpen=editorOpen.value||catalogOpen.value;
        const inset=sheetOpen?0:bottom;
        /*
         * 高度只跟着软键盘走，不跟着浏览器地址栏走。
         *
         * --visual-viewport-height 唯一的用处是手机上给全屏弹窗定高度。而 visualViewport.height
         * 有两个变化来源：软键盘（要跟）和地址栏收放（不该跟）。点开图片配置的一瞬间，
         * 弹窗锁住 body 滚动，浏览器顺势收起地址栏，高度就在弹窗刚渲染完的下一帧变一次
         * —— 全屏弹窗跟着改高，看起来就是「点一下图片，屏幕闪一下」。
         *
         * window.innerHeight 是布局视口，地址栏收放时它不动，正好当基准。只有在
         * 输入框聚焦、而且视觉视口比布局视口矮掉一大截时，才认定是键盘并跟随——
         * 地址栏那点高度（几十像素）够不着这个门槛，键盘（两三百像素）一定够得着。
         */
        const layoutHeight=window.innerHeight;
        const visualHeight=vv?vv.height:layoutHeight;
        const active=window.document.activeElement;
        const editing=active instanceof HTMLElement
          &&(/INPUT|TEXTAREA/.test(active.tagName)||active.isContentEditable);
        const keyboardOpen=editing&&visualHeight<layoutHeight-120;
        const height=keyboardOpen?visualHeight:layoutHeight;
        const metrics=[Math.round(height),Math.round(inset)].join(':');
        if(metrics===lastViewportMetrics)return;
        lastViewportMetrics=metrics;
        window.document.documentElement.style.setProperty('--visual-viewport-height',height+'px');
        window.document.documentElement.style.setProperty('--browser-bottom-inset',inset+'px');
        if(active instanceof HTMLTextAreaElement&&active.matches('[data-inline-input]'))keepInlineCaretVisible(active,40);
        /*
         * 只有弹窗自己的输入框才把光标滚进可视区。
         *
         * 少了 closest 这一层，正文里任何一个还聚着焦的输入框都会在弹窗打开时触发一次
         * scrollIntoView({behavior:'smooth'}) —— 滚的是背后那一整页，看起来就是「双击
         * 图片，页面闪一下」。文档末尾那个「直接开始写」的输入框正好是这种情况。
         */
        else if(editorOpen.value&&active instanceof HTMLElement
          &&/INPUT|TEXTAREA/.test(active.tagName)&&active.closest('.el-dialog'))ensureVisible();
      }
      function viewport(){if(viewportFrame==null)viewportFrame=requestAnimationFrame(applyViewport);}
      function selectedMedia(item:MediaView){
        if(!draft.value)return false;
        return draft.value.type==='gallery'?(draft.value.data.mediaIds||[]).includes(item.id):draft.value.data.mediaId===item.id;
      }
      function toggleDraftMedia(item:MediaView){
        const block=draft.value;if(!block)return;
        if(block.type==='gallery'){
          const ids=block.data.mediaIds||[];
          block.data.mediaIds=ids.includes(item.id)?ids.filter(x=>x!==item.id):[...ids,item.id];
        }else block.data.mediaId=item.id;
      }
      /*
       * 拍完照片先在正文里占个位再传。
       *
       * 图片管理器那条路（上传 → 等待 → 回列表 → 选中 → 插入 → 配置）在旅途中太长了，
       * 常见的需求就是「刚拍的这张，放在我正写的这段后面」。所以这里先插入一个带
       * pendingKey 的区块显示本地缩略图和进度，上传成功再把 mediaId 填回去。
       * 存草稿时未完成的占位会被剔除，服务器上不会留半截图片块。
       */
      function pendingUpload(key:string){return props.uploads.find(item=>item.key===key)||null;}
      function isPending(block:EditorBlock){
        return (block.type==='image'&&block.data.pendingKey&&!block.data.mediaId)
          ||(block.type==='gallery'&&block.data.pendingKeys?.length);
      }
      function pendingKeysOf(block:EditorBlock):string[]{return block.type==='gallery'?(block.data.pendingKeys||[]):block.data.pendingKey?[block.data.pendingKey]:[];}
      function pendingProgress(block:EditorBlock){
        const tasks=pendingPreviews(block);
        if(!tasks.length)return 0;
        return Math.round(tasks.reduce((sum,task)=>sum+(task.status==='done'?100:task.progress||0),0)/tasks.length);
      }
      function pendingFailed(block:EditorBlock){return pendingKeysOf(block).map(pendingUpload).some(task=>task?.status==='failed');}
      function pendingLabel(block:EditorBlock){
        const tasks=pendingPreviews(block);
        if(!tasks.length)return '准备中';
        if(tasks.some(task=>task.status==='failed'))return '有 '+tasks.filter(t=>t.status==='failed').length+' 张上传失败';
        return tasks.length>1?('上传中 '+tasks.filter(t=>t.status==='done').length+'/'+tasks.length):(tasks[0]?.name||'上传中');
      }
      function pendingPreviews(block:EditorBlock):BlockUpload[]{return pendingKeysOf(block).map(pendingUpload).filter((task):task is BlockUpload=>Boolean(task)).slice(0,4);}
      function insertPending(items:BlockUpload[]){
        if(!items?.length)return;
        const at=focusedIndex.value>=0&&focusedIndex.value<document.value.blocks.length
          ? focusedIndex.value+1 : document.value.blocks.length;
        const keys=items.map(item=>item.key);
        const block=items.length>1
          // pendingOrder 记住用户挑照片时的先后，上传是并发的、谁先传完不一定；
          // 没有它的话图片组会按上传完成顺序排，和相册里看到的顺序对不上
          ? JB.createBlock('gallery',{mediaIds:[],pendingKeys:keys.slice(),pendingOrder:keys.slice(),pendingResolved:{}}) as EditorBlock
          : JB.createBlock('image',{mediaId:null,pendingKey:keys[0]}) as EditorBlock;
        document.value.blocks.splice(at,0,block);
        focusedIndex.value=at;flushInline();
        nextTick(()=>window.document.querySelector('[data-editor-block-id="'+block.id+'"]')?.scrollIntoView({behavior:'smooth',block:'center'}));
      }
      /** 按 pendingOrder 把已完成的照片摆回原来的位置。 */
      function rebuildGalleryOrder(block:EditorBlock){
        const resolved=block.data.pendingResolved||{};
        const order=block.data.pendingOrder||Object.keys(resolved);
        block.data.mediaIds=order.map(key=>resolved[key]).filter(id=>id!=null);
      }
      /** 某一张传完了，把真实 mediaId 填回占位它的那个区块。 */
      function resolvePending(key:string,mediaId:number){
        document.value.blocks.forEach(block=>{
          if(block.data.pendingKey===key){block.data.mediaId=mediaId;delete block.data.pendingKey;}
          if(Array.isArray(block.data.pendingKeys)&&block.data.pendingKeys.includes(key)){
            block.data.pendingResolved=Object.assign({},block.data.pendingResolved,{[key]:mediaId});
            block.data.pendingKeys=block.data.pendingKeys.filter(item=>item!==key);
            rebuildGalleryOrder(block);
            if(!block.data.pendingKeys.length){
              delete block.data.pendingKeys;delete block.data.pendingOrder;delete block.data.pendingResolved;
            }
          }
        });
        flushInline();
      }
      /** 放弃某张的占位（上传失败后选择删除），空掉的区块一并移除。 */
      function dropPending(key:string){
        document.value.blocks=document.value.blocks.filter(block=>{
          if(block.data.pendingKey===key)return false;
          if(Array.isArray(block.data.pendingKeys)&&block.data.pendingKeys.includes(key)){
            block.data.pendingKeys=block.data.pendingKeys.filter(item=>item!==key);
            if(Array.isArray(block.data.pendingOrder))
              block.data.pendingOrder=block.data.pendingOrder.filter(item=>item!==key);
            rebuildGalleryOrder(block);
            if(!block.data.pendingKeys.length){
              delete block.data.pendingKeys;delete block.data.pendingOrder;delete block.data.pendingResolved;
              return (block.data.mediaIds||[]).length>0;
            }
          }
          return true;
        });
        flushInline();
      }
      function retryPending(block:EditorBlock){pendingKeysOf(block).forEach(key=>{if(pendingUpload(key)?.status==='failed')emit('retry-upload',key);});}
      /** 作者放弃这张照片。除了移除占位块，还要让父组件把本机存的那份副本清掉。 */
      function cancelPending(block:EditorBlock){pendingKeysOf(block).forEach(key=>{if(!key)return;dropPending(key);emit('discard-upload',key);});}
      function insertMedia(ids:number|number[],preferredType?:string){
        const values=(Array.isArray(ids)?ids:[ids]).filter(Boolean);if(!values.length)return;
        insertAt.value=document.value.blocks.length;
        const type=preferredType||((values.length>1)?'gallery':'image');
        draft.value=JB.createBlock(type,type==='gallery'?{mediaIds:values}:{mediaId:values[0]}) as EditorBlock;
        editIndex.value=-1;imageTab.value='content';editorOpen.value=true;
      }
      onMounted(()=>{viewport();window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
        window.document.addEventListener('click',onDocumentClick,true);window.document.addEventListener('selectionchange',onSelectionChange);});
      onBeforeUnmount(()=>{
        if(inlineTimer){clearTimeout(inlineTimer);inlineTimer=null;commit();}
        if(ensureTimer)clearTimeout(ensureTimer);
        if(caretTimer)clearTimeout(caretTimer);
        if(viewportFrame!=null)cancelAnimationFrame(viewportFrame);
        releaseDialogFit?.();
        blockFits.forEach(release=>release());
        blockFits.clear();
        teardown(previewEl.value);
        window.visualViewport?.removeEventListener('resize',viewport);window.visualViewport?.removeEventListener('scroll',viewport);
        window.document.removeEventListener('click',onDocumentClick,true);
        window.document.removeEventListener('selectionchange',onSelectionChange);
      });
      defineExpose<BlockEditorHandle>({openCatalog,insertMedia,insertQuick,insertPending,resolvePending,dropPending,flushInline});
</script>

<template>
      <div class="block-editor">
        <template v-for="(block,index) in document.blocks" :key="block.id">
          <div class="block-insert-line"><button type="button" aria-label="在这里添加内容" @click="openCatalog(index)">＋</button></div>

          <div v-if="isInline(block.type)" class="block-inline" :class="'block-inline--'+block.type" :data-editor-block-id="block.id">
            <textarea
v-model="block.data.text" v-grow :data-inline-input="block.id" rows="1"
              class="block-inline-input" :class="['block-inline-input--'+block.type,
                block.type==='heading'?'is-h'+(block.data.level||2):'',
                block.type==='paragraph'&&block.settings.style?'is-'+block.settings.style:'',
                block.type==='callout'?'is-'+(block.data.tone||'note'):'']"
              :style="{textAlign:(block.settings.align||'left') as 'left'|'center'|'right'}" :placeholder="placeholderOf(block)"
              @input="inlineInput" @focus="inlineFocus(index,$event)" @keydown.backspace="inlineBackspace($event,index)"
              @keydown.up="inlineArrow($event,index,-1)" @keydown.down="inlineArrow($event,index,1)"></textarea>
            <input
v-if="block.type==='quote'" v-model="block.data.source" class="block-inline-source"
              placeholder="出处（可选）" @input="inlineInput">
            <div class="block-inline-bar">
              <div class="block-inline-variants">
                <template v-if="block.type==='heading'">
                  <button
v-for="level in [2,3,4]" :key="level" type="button" :class="{active:(block.data.level||2)===level}"
                    @click="setHeadingLevel(block,level)">H{{level-1}}</button>
                </template>
                <template v-else-if="block.type==='callout'">
                  <button
v-for="tone in CALLOUT_TONES" :key="tone[0]"
                    type="button" :class="{active:(block.data.tone||'note')===tone[0]}" @click="setCalloutTone(block,tone[0])">{{tone[1]}}</button>
                </template>
              </div>
              <div class="block-inline-tools">
                <button type="button" class="block-inline-add" title="在下方新增正文组件" aria-label="新增正文组件" @click="insertParagraph(index)">＋正文</button>
                <button type="button" :disabled="index===0" title="上移" @click="move(index,-1)">↑</button>
                <button type="button" :disabled="index===document.blocks.length-1" title="下移" @click="move(index,1)">↓</button>
                <button type="button" title="更多设置" @click="edit(index)">⋯</button>
                <button type="button" class="danger" title="删除" @click="remove(index)">×</button>
              </div>
            </div>
          </div>

          <article v-else-if="isPending(block)" class="block-pending" :class="{'is-failed':pendingFailed(block)}" :data-editor-block-id="block.id">
            <!-- 预览是异步缩出来的，还没好时留一个同尺寸的空位，别让这一块的高度跳一下 -->
            <div class="block-pending-shots"><template v-for="task in pendingPreviews(block)" :key="task.key"><img v-if="task.preview" :src="task.preview" alt="" decoding="async"><span v-else class="block-pending-shot-empty" aria-hidden="true"></span></template></div>
            <div class="block-pending-main">
              <strong>{{pendingLabel(block)}}</strong>
              <div class="block-pending-bar"><i :style="{width:pendingProgress(block)+'%'}"></i></div>
              <div class="block-pending-actions">
                <span>{{pendingFailed(block)?'网络不稳时可以重试，照片还在手机里':pendingProgress(block)+'%'}}</span>
                <button v-if="pendingFailed(block)" type="button" @click="retryPending(block)">重试</button>
                <button type="button" class="danger" @click="cancelPending(block)">移除</button>
              </div>
            </div>
          </article>

          <article
v-else class="block-editor-card" :class="{'block-editor-card--media':isMediaType(block.type)}" :data-editor-block-id="block.id"
            :title="coarsePointer?'点击打开编辑':'双击打开编辑'"
            @click="openConfigOnTap($event,index)" @dblclick="editOnDoubleClick($event,index)">
            <header><span>{{label(block.type)}}</span><div>
              <button type="button" :disabled="index===0" @click="move(index,-1)">↑</button><button type="button" :disabled="index===document.blocks.length-1" @click="move(index,1)">↓</button>
              <button type="button" @click="edit(index)">编辑</button><button type="button" class="danger" @click="remove(index)">删除</button>
            </div></header>
            <!-- eslint-disable vue/no-v-html -- HTML 只来自 Journal Block 白名单渲染器。 -->
            <div :ref="el => bindBlockPreview(el, block.id)" class="block-editor-preview">
              <div class="journal-document" v-html="render(block)"></div>
            </div>
            <!-- eslint-enable vue/no-v-html -->
          </article>
        </template>
        <!--
          还没有任何能直接落笔的组件时，末尾始终留一个可以直接写的输入框。

          以前这里的条件是「文档为空」，于是先传一张图再想写字的人会发现输入框没了，
          得先去点「＋正文」——而「点开写日记就能直接打字」正是这个编辑器的前提。
          已经有段落时不显示：那时点任意一段就能接着写，再多一个空框只会碍事。
        -->
        <div v-if="!hasWritableBlock" class="block-inline block-inline--ghost">
          <textarea
class="block-inline-input block-inline-input--paragraph" rows="1"
            placeholder="今天发生了什么？直接开始写，回车可以换行。" @input="startWriting"></textarea>
        </div>
        <div v-if="document.blocks.length" class="block-insert-line block-insert-line--last"><button type="button" @click="openCatalog(document.blocks.length)">＋</button><span>添加内容</span></div>

        <el-dialog v-model="catalogOpen" :title="catalogMode==='quick'?'添加内容':'全部内容类型'" width="min(880px,94vw)" class="block-catalog-dialog" append-to-body align-center destroy-on-close>
          <template v-if="catalogMode==='quick'">
            <p class="block-dialog-intro">写字直接在正文里打，回车换行；需要另起正文组件时点“＋正文”。这里放的是文字之外的内容。</p>
            <div class="block-catalog block-catalog--quick"><button v-for="item in quickItems" :key="item.type" type="button" @click="choose(item)"><b>{{item.icon}}</b><span><strong>{{item.label}}</strong><small>{{item.description}}</small></span></button></div>
            <button type="button" class="block-catalog-more" @click="catalogMode='all'">更多内容（共 {{catalogCount}} 种）→</button>
          </template>
          <template v-else>
            <el-input v-model="query" clearable placeholder="搜索文字、地点、美食、图片……" class="block-search"/>
            <div class="block-categories"><button v-for="category in categories" :key="category" type="button" :class="{active:activeCategory===category}" @click="activeCategory=category">{{category}}</button></div>
            <div class="block-catalog"><button v-for="item in filtered()" :key="item.type" type="button" @click="choose(item)"><b>{{item.icon}}</b><span><strong>{{item.label}}</strong><small>{{item.description}}</small></span></button></div>
            <el-empty v-if="!filtered().length" :image-size="54" description="没有匹配的内容类型"/>
          </template>
        </el-dialog>

        <el-dialog
v-model="editorOpen" :title="(editIndex>=0?'编辑':'添加')+(draft?label(draft.type):'内容')"
          :width="isImageBlock?'min(1120px,96vw)':'min(760px,94vw)'" class="block-config-dialog" append-to-body align-center :close-on-click-modal="false">
          <div v-if="draft" class="block-config-layout" :class="{'has-preview':isImageBlock}">
            <aside v-if="isImageBlock" class="block-live-preview"><header><div><strong>正文效果</strong><small>模拟文章正文栏，不是单独放大的图片</small></div><span>文字栏宽度</span></header>
              <div ref="previewEl" class="block-preview-paper"><div class="block-preview-article"><i class="preview-text-line wide"></i><i class="preview-text-line"></i>
                <!-- eslint-disable vue/no-v-html -- HTML 只来自 Journal Block 白名单渲染器。 -->
                <div class="journal-document" v-html="draftPreview"></div>
                <!-- eslint-enable vue/no-v-html -->
                <div v-if="!draftPreview" class="block-preview-empty">选择图片后，这里会显示它在正文中的实际比例和占位</div>
                <i class="preview-text-line wide"></i><i class="preview-text-line short"></i></div></div></aside>
            <div class="block-config-form" @pointerdown.capture="rememberSelectScroll" @focusin="ensureVisible">
              <label v-if="!['heading','divider'].includes(draft.type)">区块标题（可选）<el-input v-model="draft.title" placeholder="例如 今日路线"/></label>
              <section v-if="isLinkableBlock&&hasTravelContext" class="travel-data-binding">
                <header><div><strong>旅行数据关联</strong><small>关联会把旅行工作台的数据填入区块；正文仍保存为稳定快照。</small></div>
                  <el-radio-group v-model="dataBinding.enabled" size="small" @change="onBindingModeChange"><el-radio-button :value="false">手动填写</el-radio-button><el-radio-button :value="true">关联数据</el-radio-button></el-radio-group></header>
                <template v-if="dataBinding.enabled">
                  <p v-if="bindsWholeDay(draft.type)" class="travel-data-binding__whole-day">取的是这一天的全部数据：所在城市、当天行程和当天账目，不需要逐条挑选。</p>
                  <label v-else-if="draft.type==='trip-info'">选择关联字段
                    <el-checkbox-group v-model="dataBinding.fields"><el-checkbox value="date">日记日期</el-checkbox><el-checkbox value="city">所选城市</el-checkbox><el-checkbox value="tripTitle">旅行名称</el-checkbox></el-checkbox-group>
                  </label>
                  <label v-else-if="draft.type==='route'">数据来源
                    <el-select v-model="dataBinding.source" @change="onBindingSourceChange"><el-option label="旅行城市顺序" value="stops"/><el-option label="旅行行程条目" value="itinerary"/></el-select>
                  </label>
                  <label v-if="['route','itinerary','timeline','expense-summary'].includes(draft.type)">选择要关联的数据
                    <el-select v-model="dataBinding.selectedIds" multiple filterable collapse-tags collapse-tags-tooltip placeholder="请选择"><el-option v-for="item in relatedRecords" :key="item.id" :label="recordLabel(item)" :value="item.id"/></el-select>
                  </label>
                  <label v-else-if="!['trip-info'].includes(draft.type)&&!bindsWholeDay(draft.type)">选择要关联的数据
                    <el-select v-model="dataBinding.recordId" filterable clearable placeholder="请选择"><el-option v-for="item in relatedRecords" :key="item.id" :label="recordLabel(item)" :value="item.id"/></el-select>
                  </label>
                  <p v-if="draft.type!=='trip-info'&&!bindsWholeDay(draft.type)&&!relatedRecords.length" class="travel-data-binding__empty">当前旅行还没有可用于这个组件的数据，可以切回“手动填写”。</p>
                  <div class="travel-data-binding__actions"><small>手动微调下面的内容不会修改旅行工作台；重新同步会覆盖关联字段。</small><el-button size="small" plain @click="refreshBinding">重新同步</el-button></div>
                </template>
              </section>
              <template v-if="draft.type==='paragraph'"><label>正文<el-input v-model="draft.data.text" type="textarea" :rows="8" placeholder="写下这一段故事"/></label>
                <div class="form-grid form-grid-2"><label>段落样式<el-select v-model="draft.settings.style"><el-option label="普通正文" value="normal"/><el-option label="开篇引言" value="lead"/><el-option label="轻声旁注" value="note"/></el-select></label><label>文字对齐<el-select v-model="draft.settings.align"><el-option label="左对齐" value="left"/><el-option label="居中" value="center"/><el-option label="右对齐" value="right"/></el-select></label></div>
              </template>
              <template v-else-if="draft.type==='heading'"><label>标题<el-input v-model="draft.data.text" placeholder="章节标题"/></label><label>层级<el-radio-group v-model="draft.data.level"><el-radio-button :value="2">大标题</el-radio-button><el-radio-button :value="3">小标题</el-radio-button><el-radio-button :value="4">细分标题</el-radio-button></el-radio-group></label></template>
              <template v-else-if="draft.type==='quote'"><label>引用内容<el-input v-model="draft.data.text" type="textarea" :rows="6"/></label><label>出处（可选）<el-input v-model="draft.data.source"/></label></template>
              <template v-else-if="draft.type==='callout'"><div class="form-grid form-grid-2"><label>卡片类型<el-select v-model="draft.data.tone"><el-option label="旅途心得" value="note"/><el-option label="温馨提示" value="tip"/><el-option label="重要提醒" value="warning"/><el-option label="特别记忆" value="memory"/></el-select></label><label>图标（可选）<el-input v-model="draft.data.icon" maxlength="2" placeholder="例如 ✦"/></label></div><label>内容<el-input v-model="draft.data.text" type="textarea" :rows="5"/></label></template>
              <template v-else-if="draft.type==='facts'"><div v-for="(item,i) in objectItems(draft.data.items)" :key="i" class="block-row"><el-input v-model="item.label" placeholder="名称"/><el-input v-model="item.value" placeholder="内容"/><button type="button" @click="removeRow('items',i)">×</button></div><el-button plain @click="addRow('items',{label:'',value:''})">＋ 添加信息</el-button></template>
              <template v-else-if="draft.type==='pros-cons'"><div class="block-dual-list"><section><strong>喜欢</strong><div v-for="(_,i) in draft.data.pros" :key="i" class="block-row"><el-input v-model="draft.data.pros[i]"/><button type="button" @click="removeRow('pros',i)">×</button></div><el-button plain @click="addRow('pros','')">＋ 添加</el-button></section><section><strong>遗憾</strong><div v-for="(_,i) in draft.data.cons" :key="i" class="block-row"><el-input v-model="draft.data.cons[i]"/><button type="button" @click="removeRow('cons',i)">×</button></div><el-button plain @click="addRow('cons','')">＋ 添加</el-button></section></div></template>
              <template v-else-if="draft.type==='table'"><div class="block-table-editor"><div class="block-table-head"><div v-for="(_,i) in draft.data.headers" :key="i"><el-input v-model="draft.data.headers[i]" placeholder="列名"/><button type="button" @click="removeTableColumn(i)">×</button></div><el-button plain @click="addTableColumn">＋ 列</el-button></div><div v-for="(row,ri) in draft.data.rows" :key="ri" class="block-table-row"><el-input v-for="(_,ci) in draft.data.headers" :key="ci" v-model="row[ci]"/><button type="button" @click="removeRow('rows',ri)">删除</button></div></div><el-button plain @click="addTableRow">＋ 添加一行</el-button></template>
              <template v-else-if="draft.type==='link-card'"><label>链接地址<el-input v-model="draft.data.url" placeholder="https://"/></label><label>标题<el-input v-model="draft.data.title"/></label><label>简介<el-input v-model="draft.data.description" type="textarea" :rows="3"/></label></template>
              <template v-else-if="draft.type==='rating'"><label>评分<el-rate v-model="draft.data.score" :max="draft.data.max||5" show-score/></label><div class="form-grid form-grid-2"><label>满分<el-input-number v-model="draft.data.max" :min="3" :max="10"/></label><label>一句感受<el-input v-model="draft.data.comment"/></label></div></template>
              <template v-else-if="['checklist','route'].includes(draft.type)"><div v-for="(item,i) in (draft.type==='checklist'?objectItems(draft.data.items):draft.data.items)" :key="i" class="block-row"><template v-if="typeof item==='object'"><el-checkbox v-model="item.checked"/><el-input v-model="item.text" placeholder="清单内容"/></template><el-input v-else v-model="draft.data.items[i]" placeholder="地点"/><button type="button" @click="removeRow('items',i)">×</button></div><el-button plain @click="addRow('items',draft.type==='checklist'?{text:'',checked:false}:'')">＋ 添加一项</el-button></template>
              <template v-else-if="draft.type==='stats'"><div v-for="(item,i) in objectItems(draft.data.items)" :key="i" class="block-row"><el-input v-model="item.value" placeholder="数字，例如 18,642"/><el-input v-model="item.label" placeholder="说明，例如 步"/><button type="button" @click="removeRow('items',i)">×</button></div><el-button plain @click="addRow('items',{value:'',label:''})">＋ 添加数字</el-button></template>
              <template v-else-if="draft.type==='companions'"><div v-for="(item,i) in objectItems(draft.data.items)" :key="i" class="block-complex-row"><el-input v-model="item.name" placeholder="名字"/><el-input v-model="item.role" placeholder="关系或角色"/><el-input v-model="item.note" type="textarea" placeholder="想记住的小事"/><button type="button" @click="removeRow('items',i)">删除</button></div><el-button plain @click="addRow('items',{name:'',role:'',note:''})">＋ 添加同行者</el-button></template>
              <template v-else-if="draft.type==='trip-info'"><div class="form-grid form-grid-2"><label>日期<el-date-picker v-model="draft.data.date" type="date" value-format="YYYY-MM-DD"/></label><label>地点<el-input v-model="draft.data.city"/></label><label>旅行<el-input v-model="draft.data.tripTitle"/></label><label>天气<el-input v-model="draft.data.weather"/></label><label>心情<el-input v-model="draft.data.mood"/></label></div></template>
              <template v-else-if="['itinerary','timeline'].includes(draft.type)"><div v-for="(item,i) in objectItems(draft.data.items)" :key="i" class="block-complex-row"><el-input v-model="item.time" placeholder="时间"/><el-input v-model="item.title" placeholder="发生了什么"/><el-input v-model="item.address" placeholder="地点（可选）"/><el-input v-if="draft.type==='timeline'" v-model="item.description" type="textarea" placeholder="补充描述"/><button type="button" @click="removeRow('items',i)">删除</button></div><el-button plain @click="addRow('items',{time:'',title:'',address:'',description:''})">＋ 添加行程</el-button></template>
              <template v-else-if="draft.type==='expense-summary'"><div class="form-grid form-grid-2"><label>币种<el-input v-model="draft.data.currency"/></label><label>合计<el-input-number v-model="draft.data.total" :min="0"/></label></div><div v-for="(item,i) in draft.data.categories" :key="i" class="block-row"><el-input v-model="item.name" placeholder="分类"/><el-input-number v-model="item.amount" :min="0"/><button type="button" @click="removeRow('categories',i)">×</button></div><el-button plain @click="addRow('categories',{name:'',amount:0})">＋ 添加分类</el-button></template>
              <template v-else-if="draft.type==='location-card'"><label>地点名称<el-input v-model="draft.data.name"/></label><label>地址<el-input v-model="draft.data.address"/></label><div class="form-grid form-grid-2"><label>开放时间<el-input v-model="draft.data.hours"/></label><label>费用<el-input v-model="draft.data.cost"/></label></div><label>感受与建议<el-input v-model="draft.data.impression" type="textarea" :rows="4"/></label></template>
              <template v-else-if="draft.type==='food'"><div class="form-grid form-grid-2"><label>菜品<el-input v-model="draft.data.dish"/></label><label>店铺<el-input v-model="draft.data.restaurant"/></label><label>价格<el-input v-model="draft.data.price"/></label><label>评分<el-rate v-model="draft.data.rating"/></label></div><label>味道与感受<el-input v-model="draft.data.note" type="textarea" :rows="4"/></label></template>
              <template v-else-if="draft.type==='stay'"><div class="form-grid form-grid-2"><label>住宿名称<el-input v-model="draft.data.name"/></label><label>房型<el-input v-model="draft.data.room"/></label><label>入住晚数<el-input-number v-model="draft.data.nights" :min="1"/></label><label>评分<el-rate v-model="draft.data.rating"/></label></div><label>住宿体验<el-input v-model="draft.data.note" type="textarea" :rows="4"/></label></template>
              <template v-else-if="draft.type==='transport'"><div class="form-grid form-grid-2"><label>交通方式<el-input v-model="draft.data.mode" placeholder="高铁 / 航班 / 自驾"/></label><label>班次<el-input v-model="draft.data.number"/></label><label>出发地<el-input v-model="draft.data.from"/></label><label>目的地<el-input v-model="draft.data.to"/></label><label>耗时<el-input v-model="draft.data.duration"/></label></div><label>乘坐提示<el-input v-model="draft.data.note" type="textarea" :rows="3"/></label></template>
              <template v-else-if="draft.type==='day-opener'">
                <p class="setting-explain">开头这一屏是读者看到的第一眼。城市、第几天、路线和花费都从旅行工作台自动取，天气写一个字就够。</p>
                <div class="form-grid form-grid-2"><label>城市<el-input v-model="draft.data.city" placeholder="东京"/></label><label>第几天<el-input v-model="draft.data.dayLabel" placeholder="Day 4"/></label>
                  <label>日期<el-date-picker v-model="draft.data.date" type="date" value-format="YYYY-MM-DD"/></label><label>天气<el-input v-model="draft.data.weather" placeholder="晴"/></label></div>
                <label>今天走过的地方</label>
                <div v-for="(_,i) in draft.data.route" :key="i" class="block-row"><el-input v-model="draft.data.route[i]" placeholder="浅草"/><button type="button" @click="removeRow('route',i)">×</button></div>
                <el-button plain @click="addRow('route','')">＋ 添加一站</el-button>
                <label>关键数字</label>
                <div v-for="(item,i) in draft.data.metrics" :key="'m'+i" class="block-row"><el-input v-model="item.value" placeholder="21,430"/><el-input v-model="item.label" placeholder="步"/><button type="button" @click="removeRow('metrics',i)">×</button></div>
                <el-button plain @click="addRow('metrics',{value:'',label:''})">＋ 添加数字</el-button>
              </template>
              <template v-else-if="draft.type==='chapter'">
                <p class="setting-explain">用时间把一天分成几段，长日记读起来才有节奏。</p>
                <div class="form-grid form-grid-2"><label>时间<el-input v-model="draft.data.time" placeholder="08:30"/></label><label>这一段叫什么<el-input v-model="draft.data.title" placeholder="清晨"/></label></div>
                <label>补充一句（可选）<el-input v-model="draft.data.note" placeholder="天还没完全亮"/></label>
              </template>
              <template v-else-if="draft.type==='day-summary'">
                <p class="setting-explain">一天结束时回头看一眼。花费会自动带出来，其余几项写你自己的判断。</p>
                <div v-for="(item,i) in objectItems(draft.data.items)" :key="i" class="block-complex-row"><el-input v-model="item.icon" maxlength="2" placeholder="🌟"/><el-input v-model="item.label" placeholder="今天最喜欢"/><el-input v-model="item.value" placeholder="浅草的清晨"/><button type="button" @click="removeRow('items',i)">删除</button></div>
                <el-button plain @click="addRow('items',{icon:'',label:'',value:''})">＋ 添加一条</el-button>
              </template>
              <template v-else-if="draft.type==='weather'"><div class="form-grid form-grid-2"><label>天气<el-input v-model="draft.data.condition"/></label><label>温度<el-input v-model="draft.data.temperature" placeholder="26°C"/></label><label>体感<el-input v-model="draft.data.feelsLike"/></label><label>风力<el-input v-model="draft.data.wind"/></label></div><label>天气带来的感受<el-input v-model="draft.data.note" type="textarea" :rows="3"/></label></template>
              <template v-else-if="isImageBlock">
                <el-tabs v-model="imageTab" class="image-setting-tabs">
                  <el-tab-pane label="内容" name="content"><div class="image-setting-section"><header><strong>选择要放进正文的图片</strong><small>{{draft.type==='gallery'?'可多选，再到“版式”选择组合方式':'单击图片进行选择'}}</small></header>
                    <div class="block-image-picker"><button v-for="item in media" :key="item.id" type="button" :class="{selected:selectedMedia(item)}" @click="toggleDraftMedia(item)"><img :src="item.thumbnailUrl||item.displayUrl" loading="lazy" decoding="async" :alt="item.caption||item.filename"><span>{{item.caption||item.filename}}</span></button><p v-if="!media.length">图片库为空，请先在图片管理中上传。</p></div>
                    <template v-if="draft.type==='postcard'"><p class="setting-explain">{{imageModeHint}}</p><div class="form-grid form-grid-2"><label>地点<el-input v-model="draft.data.location"/></label><label>日期<el-date-picker v-model="draft.data.date" type="date" value-format="YYYY-MM-DD"/></label></div><label>明信片正文<el-input v-model="draft.data.message" type="textarea" :rows="5" placeholder="写下想和这张照片一起留下的话"/></label><label>署名<el-input v-model="draft.data.signature"/></label></template>
                    <label v-else>图注（可选）<el-input v-model="draft.data.caption" placeholder="会跟随图片显示，也可以在“图注”中调整位置"/></label>
                  </div></el-tab-pane>
                  <el-tab-pane v-if="draft.type!=='postcard'" label="版式" name="layout"><div class="image-setting-section"><header><strong>图片在正文里占多大、怎样排列</strong><small>预览中的灰色短线代表文章文字</small></header>
                    <p class="setting-explain">{{imageModeHint}}</p><div class="form-grid form-grid-2">
                      <label>占用宽度<el-select v-model="draft.settings.size"><el-option label="跟随当前主题" value=""/><el-option label="小图 · 约文字栏 42%" value="small"/><el-option label="中等 · 约文字栏 68%" value="medium"/><el-option label="大图 · 约文字栏 90%" value="large"/><el-option label="正文宽度 · 与文字同宽" value="full"/><el-option label="通栏出血 · 超出文字栏" value="bleed"/></el-select><small class="field-help">未单独选择时使用主题设计器的图片默认宽度；“通栏出血”会向文字栏两侧延伸。</small></label>
                      <label v-if="alignAvailable">在文字栏中的位置<el-select v-model="draft.settings.align"><el-option label="靠左" value="left"/><el-option label="居中" value="center"/><el-option label="靠右" value="right"/></el-select></label><p v-else class="setting-inline-note">当前宽度已经占满或超出文字栏，因此无需设置左右位置。</p>
                      <label v-if="draft.type==='gallery'">图片组排版<el-select v-model="draft.settings.layout"><el-option label="跟随当前主题" value=""/><el-option label="规则网格" value="grid"/><el-option label="横向并排" value="row"/><el-option label="瀑布流" value="masonry"/><el-option label="主图拼贴" value="mosaic"/><el-option label="杂志版" value="magazine"/><el-option label="故事流" value="story"/><el-option label="错落画廊" value="staggered"/><el-option label="轮播" value="carousel"/><el-option label="胶片条" value="filmstrip"/><el-option label="前后对比" value="compare"/></el-select><small class="field-help">{{imageModeHint}}</small></label>
                      <label v-if="layoutUsesColumns">每行列数<el-input-number v-model="draft.settings.columns" :min="1" :max="6"/><small class="field-help">只在规则网格和瀑布流中生效。</small></label>
                      <label v-if="layoutUsesRatio">照片显示比例<el-select v-model="draft.settings.ratio"><el-option :label="draft.type==='gallery'?'使用当前排版的默认比例':'保留照片原始比例'" value=""/><el-option label="16:9 · 横向风景" value="16x9"/><el-option label="4:3 · 常规照片" value="4x3"/><el-option label="1:1 · 方形" value="1x1"/><el-option label="3:4 · 竖向照片" value="3x4"/></el-select><small class="field-help">指定比例会裁切照片，但不会拉伸变形；图片组留空时由所选排版决定。</small></label><p v-else class="setting-inline-note">当前排版会保留每张照片的原始比例，因此无需设置裁切比例。</p>
                    </div></div></el-tab-pane>
                  <el-tab-pane v-if="draft.type!=='postcard'" label="外观" name="appearance"><div class="image-setting-section"><header><strong>装饰照片</strong><small>这些效果不会改变原图文件</small></header><div class="form-grid form-grid-2">
                    <label>相框样式<el-select v-model="draft.settings.frame"><el-option label="跟随当前主题" value=""/><el-option label="无边框" value="none"/><el-option label="细线描边" value="line"/><el-option label="相纸白边" value="paper"/><el-option label="浮起阴影" value="float"/><el-option label="宝丽来" value="polaroid"/><el-option label="手账胶带" value="tape"/><el-option label="胶片边框" value="film"/><el-option label="明信片边框" value="postcard"/></el-select></label>
                    <label>圆角<el-select v-model="draft.settings.radius"><el-option label="跟随当前主题" value=""/><el-option label="直角" value="none"/><el-option label="小圆角" value="soft"/><el-option label="大圆角" value="round"/></el-select></label>
                    <label>色调<el-select v-model="draft.settings.tone"><el-option label="保留原图" value=""/><el-option label="暖色" value="warm"/><el-option label="复古" value="vintage"/><el-option label="黑白" value="mono"/></el-select></label>
                    <label>电脑悬停效果<el-select v-model="draft.settings.effect"><el-option label="无" value=""/><el-option label="轻轻浮起" value="lift"/><el-option label="轻微放大" value="zoom"/><el-option label="手账倾斜" value="tilt"/></el-select><small class="field-help">只在鼠标悬停时生效，手机浏览不会触发。</small></label>
                  </div></div></el-tab-pane>
                  <el-tab-pane v-if="draft.type!=='postcard'" label="图注" name="caption"><div class="image-setting-section"><header><strong>照片说明</strong><small>图注为空时不会显示</small></header><label>图注文字<el-input v-model="draft.data.caption" placeholder="例如 青城山下山时的薄雾"/></label><label>显示位置<el-select v-model="draft.settings.captionPos"><el-option label="图片下方居中" value=""/><el-option label="图片下方靠左" value="left"/><el-option label="覆盖在图片底部" value="overlay"/><el-option label="显示在图片右侧" value="side"/><el-option label="隐藏图注" value="none"/></el-select><small class="field-help">“右侧”更适合中等或大图；手机上会自动移到图片下方。</small></label></div></el-tab-pane>
                </el-tabs>
              </template>
            </div>
          </div>
          <template #footer><div class="block-dialog-actions"><el-button v-if="editIndex<0" @click="backToCatalog">← 返回重选</el-button><span></span><el-button @click="editorOpen=false">取消</el-button><el-button type="primary" @click="confirmEdit">确认{{editIndex>=0?'修改':'插入'}}</el-button></div></template>
        </el-dialog>
      </div>
</template>
