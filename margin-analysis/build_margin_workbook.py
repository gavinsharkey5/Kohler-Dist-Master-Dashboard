#!/usr/bin/env python3
"""Build the Kohler margin & deal-level workbook from Encompass exports.

Usage:
    python3 build_margin_workbook.py --inputs <folder> --out Kohler_Margin_Deal_Level_Analysis_Aug_2026.xlsx

<folder> must contain:
    InvoiceTransReport*.csv         one or more Encompass Invoice Transaction Reports covering the month
    Pricing_Analysis_RDE_by_Month*.csv   the Encompass "Pricing Analysis RDE by Month" export for the same month
    Pricing_Deal_Levels*.xlsx       (optional) the earlier deal-level workbook; its Deal Levels sheet supplies
                                    Supplier / Brand / Package per product. Without it, brand and package are
                                    parsed from the product name and supplier comes from the pricing export.
The rep / area / premise labels on Customer Summary come from ../hub/data/accounts.js.

After building, open the file in Excel (or run LibreOffice headless) so the formulas calculate.
See README.txt in this folder.
"""
import argparse, glob, json, os, re, sys
import pandas as pd, numpy as np
ap=argparse.ArgumentParser(); ap.add_argument('--inputs',required=True); ap.add_argument('--out',required=True)
ap.add_argument('--hub-accounts',default=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','hub','data','accounts.js'))
args=ap.parse_args()
OUT=args.out

def money(s):
    s=s.fillna('').astype(str).str.replace('$','',regex=False).str.replace(',','',regex=False).str.replace('%','',regex=False).str.strip()
    neg=s.str.startswith('('); s=s.str.replace('(','',regex=False).str.replace(')','',regex=False)
    v=pd.to_numeric(s, errors='coerce'); v[neg]=-v[neg]; return v

# ---- invoice files
files=sorted(glob.glob(os.path.join(args.inputs,'*InvoiceTransReport*.csv')))
if not files: sys.exit('no InvoiceTransReport*.csv in '+args.inputs)
df=pd.concat([pd.read_csv(f,dtype=str) for f in files],ignore_index=True)
for c in ['Cases','Num Units','FOB','Tax Cost','Laid-in Cost','Full Price','Discount','Participation','Deposit','Unit Price','Ext Price','Ordered']: df[c+'_n']=money(df[c])
df['date']=pd.to_datetime(df['Load Sheet Date'])
df['prod_num']=df['Product'].str.extract(r'^(\S+)\s')[0]; df['cust_num']=df['Customer'].str.extract(r'^(\S+)\s')[0]
if df['Invoice Trans ID'].duplicated().any(): print('WARNING: duplicate Invoice Trans IDs across the files - overlapping exports?')
print('invoice lines',len(df),df['date'].min().date(),'-',df['date'].max().date())
# ---- pricing export
pf=sorted(glob.glob(os.path.join(args.inputs,'*Pricing_Analysis_RDE_by_Month*.csv')))
if not pf: sys.exit('no Pricing_Analysis_RDE_by_Month*.csv in '+args.inputs)
px=pd.read_csv(pf[-1],dtype=str)
for c in ['Min Purchase Qty','Case Unit Price','Cases','FOB','Tax','Participation','Laid-in Cost','Gross','Margin %']: px[c+'_n']=money(px[c])
px['prod_num']=px['Product Num & Name'].str.extract(r'^(\S+)\s')[0]
px['start']=pd.to_datetime(px['Deal Start Date']); px['end']=pd.to_datetime(px['Deal End Date'])
# ---- brand / package split from the earlier workbook (optional)
bx=sorted(glob.glob(os.path.join(args.inputs,'*Pricing_Deal_Levels*.xlsx')))
if bx:
    import openpyxl
    wbb=openpyxl.load_workbook(bx[-1],read_only=True); wsb=wbb['Deal Levels']
    brand=pd.DataFrame(list(wsb.iter_rows(min_row=2,max_col=6,values_only=True)),columns=['Supplier','Product #','Product','Brand','Package','Family'])
else:
    brand=pd.DataFrame(columns=['Supplier','Product #','Product','Brand','Package','Family'])
# ---- hub customer base
cust={}
try:
    s_=open(args.hub_accounts).read(); i=s_.index('{'); d,_=json.JSONDecoder().raw_decode(s_[i:])
    for rep,accts in d['reps'].items():
        for a in accts: cust[a['n']]={'rep':rep,'area':a.get('area'),'prem':a.get('prem'),'county':a.get('county')}
except Exception as e: print('hub accounts not loaded:',e)

# ======================= stage 1: classify, brand, match deal levels =======================
n=lambda c: df[c+'_n']

# ---------- classify every raw line ----------
INTERNAL={'7 Breakage':'Breakage (write-off at cost)','8 Out Of Code':'Out-of-code (write-off at cost)',
 '6 Kohler Samples Taken 100%':'Samples (at cost)','120022 Kohler Samples Taken 50%':'Samples (at cost)',
 '9 Fifo Adjustment':'FIFO / inventory adjustment','5 Inventory Adjustment':'FIFO / inventory adjustment'}
core=df['Product'].str.replace(r'^\S+\s','',regex=True)
def classify(r):
    c=r['Customer']
    if c in INTERNAL: return INTERNAL[c]
    if 'TOO OLD FOR CREDIT' in str(r['Promotion Name']).upper(): return 'Too-old-for-credit zero-out / sell-back to supplier'
    if pd.isna(r['FOB_n']):
        p=r['Product']
        if 'Empty' in p: return 'Empty keg / cooperage return (deposit)'
        if 'Billback' in p: return 'Supplier billback invoice'
        if 'NSF' in p or 'Finance' in p or 'Write' in p or 'Write off' in p: return 'Finance / NSF / write-off'
        if any(k in p for k in ['Kiosk','cold plate','Cold Plate','Trailer','Gas Tank','00998','Cold']): return 'Equipment / deposit item'
        if r['Cases_n']==0: return 'Zero-quantity line (no cost on file)'
        return 'Product line with no cost on file'
    if r['Cases_n']==0: return 'Zero-quantity line'
    return 'Sale' if r['Cases_n']>0 else 'Credit / return'
df['category']=df.apply(classify, axis=1)
print(df['category'].value_counts())

# ---------- brand / family ----------
brand['Product #']=brand['Product #'].astype(str)
bmap=brand.drop_duplicates('Product #').set_index('Product #')
pxsup=px.drop_duplicates('prod_num').set_index('prod_num')['Supplier']
SIZE=re.compile(r'\s(\d+/\d+|\d+(\.\d+)?\s*(Gal|L\b|BBL)|\d+\s*(mL|ML|ml)|750|1\.75|1\.5|375|Keg)')
def split_name(name):
    m=SIZE.search(' '+name)
    if m: 
        i=m.start()-1
        return name[:i].strip(), name[i:].strip()
    return name, ''
TWO={'blue moon','sam adams','samuel adams','twisted tea','sun cruiser','angry orchard','dogfish head','white claw','cayman jack','fever tree','cape may','southern tier','high life','arnold palmer','pilsner urquell','steel reserve','milwaukee best','olde english','voodoo ranger','sierra nevada','new belgium','flying fish','green river','leyenda 1925','big man','source brewing','evil genius','other half','garage beer','le grand','red bull','mikes hard',"mike's hard",'yard house','bavik super','dos equis','stella artois','coors light','coors banquet','miller lite','miller high','genesee cream','founders all','lord hobo','bud light','fat tire','lagunitas ipa','east coast','1911 hard','downeast cider','carbliss','hofbrau','st. pauli','st pauli','estrella damm','narragansett','warsteiner','paulaner','spaten','franziskaner','erdinger','weihenstephaner','ayinger','kirin ichiban','sapporo','asahi','tsingtao','modelo especial','modelo negra','modelo oro','modelo chelada','corona extra','corona light','corona premier','corona familiar','corona sunbrew','two roads','magic hat','harpoon ipa','bronx brewery','kane brewing','carton brewing','conclave brewing','czig meister','montauk','athletic brewing','sun cruiser','truly hard','viva tequila','crescent 9','waterloo','bardstown','2xo','1925'}
ALIAS={'coronita':'Corona','modelito':'Modelo','coors':'Coors','miller':'Miller','modelo':'Modelo','corona':'Corona','peroni':'Peroni','keystone':'Keystone','victoria':'Victoria','pacifico':'Pacifico','yuengling':'Yuengling','heineken':'Heineken','guinness':'Guinness','truly':'Truly','pabst':'Pabst','stiegl':'Stiegl','leinenkugel':'Leinenkugel','blue':'Blue Moon','sam':'Sam Adams','samuel':'Sam Adams','twisted':'Twisted Tea','sun':'Sun Cruiser','angry':'Angry Orchard','dogfish':'Dogfish Head','white':'White Claw','cayman':'Cayman Jack','fever':'Fever Tree','cape':'Cape May','southern':'Southern Tier','high':'High Life','voodoo':'Voodoo Ranger','bells':"Bell's","bell's":"Bell's",'mikes':"Mike's Hard","mike's":"Mike's Hard",'leyenda':'Leyenda 1925','bardstown':'Bardstown','fosters':'Fosters','dos':'Dos Equis','stella':'Stella Artois','new':'New Belgium','flying':'Flying Fish','green':'Green River'}
def family(b):
    w=b.split()
    if not w: return b
    k=w[0].lower().strip(',')
    if k in ALIAS: return ALIAS[k]
    if len(w)>=2 and (w[0]+' '+w[1]).lower() in TWO: return w[0]+' '+w[1]
    return w[0]
def brand_of(pn, name):
    if pn in bmap.index:
        r=bmap.loc[pn]; return r['Supplier'], r['Brand'], r['Package']
    b,p=split_name(name); return (pxsup[pn] if pn in pxsup.index else 'Not in pricing export'), b, p
info={}
for pn,name in df.drop_duplicates('prod_num')[['prod_num','Product']].itertuples(index=False):
    nm=re.sub(r'^\S+\s','',name)
    sup,b,pk=brand_of(pn,nm); info[pn]=(sup,b,pk,family(b))
df['Supplier']=df['prod_num'].map(lambda x: info[x][0]); df['Brand']=df['prod_num'].map(lambda x: info[x][1])
df['Package']=df['prod_num'].map(lambda x: info[x][2]); df['Family']=df['prod_num'].map(lambda x: info[x][3])
_canon={}
for fam in df['Family'].value_counts().index:
    _canon.setdefault(fam.lower().strip(), fam)
df['Family']=df['Family'].map(lambda f: _canon[f.lower().strip()])
info={k:(v[0],v[1],v[2],_canon[v[3].lower().strip()]) for k,v in info.items()}
df['ProdName']=df['Product'].str.replace(r'^\S+\s','',regex=True)
df['CustName']=df['Customer'].str.replace(r'^\S+\s','',regex=True)

# ---------- economics per raw line ----------
df['units']=n('Num Units'); df['cases']=n('Cases')
df['net_sales']=n('Unit Price')*df['units']
df['deposits']=n('Deposit')*df['units']
df['cogs']=(n('Laid-in Cost').fillna(0)+n('Tax Cost').fillna(0)-n('Participation').fillna(0))*df['units']
df['frontline']=n('Full Price')*df['units']
df['cost_at_fob']=n('FOB_n'.replace('_n','')).fillna(0)*df['units'] if False else n('FOB').fillna(0)*df['units']
df['inv_value_cost']=(n('Laid-in Cost').fillna(0)+n('Tax Cost').fillna(0))*df['units']

# ---------- deal-level matching (sales + credits only) ----------
sales=df[df['category'].isin(['Sale','Credit / return'])].copy()
sales['upc']=sales['units']/sales['cases']
sales['case_price']=(n('Unit Price')[sales.index]*sales['upc']).round(2)
sales['front_case']=(n('Full Price')[sales.index]*sales['upc']).round(2)
pxg={}
for _,r in px.iterrows():
    pxg.setdefault(r['prod_num'],[]).append((round(r['Case Unit Price_n'],2), int(r['Min Purchase Qty_n']), r['start'], r['end']))
def match(r):
    cands=pxg.get(r['prod_num'])
    if not cands: return ('Not on deal sheet','Product not in pricing export',np.nan)
    cp=r['case_price']; d=r['date']
    inwin=sorted({lvl for p,lvl,s,e in cands if abs(p-cp)<=0.011 and s<=d<=e})
    if len(inwin)==1: return ('Identified','Price matches one deal level in window',inwin[0])
    if len(inwin)>1 and 0 in inwin and abs(cp-r['front_case'])<=0.011: return ('Identified','Front-line price paid (levels '+'/'.join(map(str,inwin))+' carry the same price; treated as front-line)',0)
    if len(inwin)>1: return ('Ambiguous','Levels '+'/'.join(map(str,inwin))+' share this price','/'.join(map(str,inwin)))
    anyp=sorted({lvl for p,lvl,s,e in cands if abs(p-cp)<=0.011})
    if anyp: return ('Outside window','Price matches level '+'/'.join(map(str,anyp))+' but line date is outside that deal window','/'.join(map(str,anyp)))
    prices=[p for p,lvl,s,e in cands]
    if cp<min(prices)-0.011: return ('Not on deal sheet','Below deepest published price',np.nan)
    if cp>max(prices)+0.011: return ('Not on deal sheet','Above highest published (front-line) price',np.nan)
    return ('Not on deal sheet','Price between published levels',np.nan)
res=sales.apply(match, axis=1, result_type='expand'); res.columns=['match_status','match_note','level_raw']
sales=pd.concat([sales,res],axis=1)
def lvl_num(x):
    try: return int(x)
    except: return np.nan
sales['level_num']=sales['level_raw'].map(lvl_num)
sales['level_label']=sales.apply(lambda r: (('Level %d'%r['level_num']) if r['level_num']==r['level_num'] else ('Ambiguous ('+str(r['level_raw'])+')' if r['match_status']=='Ambiguous' else ('Outside window ('+str(r['level_raw'])+')' if r['match_status']=='Outside window' else 'Not identified'))), axis=1)
print(sales['match_status'].value_counts()); print(sales.groupby('match_status')['net_sales'].sum())
print(sales['match_note'].value_counts())

# ======================= stage 2: write the workbook =======================
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.table import Table
from openpyxl.comments import Comment

# ---------------- styles ----------------
FONT='Arial'
f_norm=Font(name=FONT,size=10); f_bold=Font(name=FONT,size=10,bold=True); f_title=Font(name=FONT,size=14,bold=True,color='FFFFFF')
f_h=Font(name=FONT,size=10,bold=True,color='FFFFFF'); f_input=Font(name=FONT,size=10,color='0000FF'); f_link=Font(name=FONT,size=10,color='008000')
f_sub=Font(name=FONT,size=10,italic=True,color='555555'); f_sec=Font(name=FONT,size=11,bold=True,color='1F3864')
fill_h=PatternFill('solid',fgColor='1F3864'); fill_t=PatternFill('solid',fgColor='2E75B6'); fill_in=PatternFill('solid',fgColor='FFFF00'); fill_tot=PatternFill('solid',fgColor='D9E1F2'); fill_sec=PatternFill('solid',fgColor='DDEBF7'); fill_warn=PatternFill('solid',fgColor='FCE4D6')
thin=Side(style='thin',color='BFBFBF'); box=Border(top=thin,bottom=thin,left=thin,right=thin)
FMT_D0='$#,##0;($#,##0);-'; FMT_D2='$#,##0.00;($#,##0.00);-'; FMT_P='0.0%;(0.0%);-'; FMT_N='#,##0;(#,##0);-'; FMT_N1='#,##0.0;(#,##0.0);-'
wb=Workbook()
def title(ws,text,sub=None,width=12):
    ws['A1']=text; ws['A1'].font=f_title; ws['A1'].fill=fill_t
    for c in range(1,width+1): ws.cell(1,c).fill=fill_t
    ws.row_dimensions[1].height=22
    if sub: ws['A2']=sub; ws['A2'].font=f_sub
def header(ws,row,cols,start=1):
    for i,h in enumerate(cols):
        c=ws.cell(row,start+i,h); c.font=f_h; c.fill=fill_h; c.alignment=Alignment(wrap_text=True,vertical='center'); c.border=box
    ws.row_dimensions[row].height=30
def setw(ws,widths):
    for i,w in enumerate(widths): ws.column_dimensions[L(i+1)].width=w
def cellfmt(c,fmt=None,font=f_norm,fill=None,bold=False):
    c.font=f_bold if bold else font
    if fmt: c.number_format=fmt
    if fill: c.fill=fill
def q(s): return "'"+s+"'"
# ---------------- data prep ----------------
sales['ctype']=sales['category'].map({'Sale':'Sale','Credit / return':'Credit / return'})
sales['cust_n']=sales['cust_num'].astype(int)
sales['Rep']=sales['cust_n'].map(lambda x: cust.get(x,{}).get('rep','(not in rep base)'))
sales['Area']=sales['cust_n'].map(lambda x: cust.get(x,{}).get('area','(not in rep base)'))
sales['Prem']=sales['cust_n'].map(lambda x: {'On':'On-premise','Off':'Off-premise'}.get(cust.get(x,{}).get('prem'),'(not in rep base)'))
sales['Promo']=sales['Promotion Name'].fillna('(none)'); sales['CustName']=sales['CustName'].fillna('(no name on invoice)')
def band(r):
    lv=r['level_num']
    if lv==lv:
        lv=int(lv)
        return '0 (front-line)' if lv==0 else '1-4' if lv<5 else '5-9' if lv<10 else '10-24' if lv<25 else '25-49' if lv<50 else '50-99' if lv<100 else '100-199' if lv<200 else '200+'
    if r['match_status']=='Ambiguous': return 'Deal price - level ambiguous'
    if r['match_status']=='Outside window': return 'Deal price - outside window'
    return 'Not identified'
sales['band']=sales.apply(band,axis=1)
# ---- Sales Lines aggregation
gcols=['Supplier','Family','Brand','prod_num','ProdName','Package','cust_num','CustName','Rep','Area','Prem','Promo','ctype','match_status','level_label','band','case_price']
agg=sales.groupby(gcols,dropna=False,sort=False).agg(cases=('cases','sum'),units=('units','sum'),net=('net_sales','sum'),front=('frontline','sum'),dep=('deposits','sum'),cogs=('cogs','sum'),lines=('cases','size'),note=('match_note','first')).reset_index()
agg['cust_i']=agg['cust_num'].astype(int)
agg=agg.sort_values(['cust_i','Supplier','prod_num','case_price']).reset_index(drop=True)
cust_rows={}
for i,cn in enumerate(agg['cust_i']):
    a=cust_rows.setdefault(cn,[5+i,5+i]); a[1]=5+i
agg['front_case']=np.where(agg['cases']!=0,agg['front']/agg['cases'],0)
print('Sales Lines rows',len(agg))
# ---- Deal level analysis grid
dg=['Supplier','Family','Brand','prod_num','ProdName','Package','match_status','level_label','band','case_price']
dla=sales.groupby(dg,dropna=False,sort=False).agg(level_num=('level_num','first'),level_raw=('level_raw','first'),cases=('cases','sum'),units=('units','sum'),net=('net_sales','sum'),front=('frontline','sum'),cogs=('cogs','sum'),ncust=('cust_num','nunique'),lines=('cases','size')).reset_index()
prod_ns=sales.groupby('prod_num')['net_sales'].sum()
dla['pns']=dla['prod_num'].map(prod_ns)
dla['lvsort']=dla['level_num'].fillna(9999)
dla=dla.sort_values(['pns','prod_num','lvsort','case_price'],ascending=[False,True,True,False]).reset_index(drop=True)
dla['front_case']=np.where(dla['cases']!=0,dla['front']/dla['cases'],0)
print('DLA rows',len(dla))
# ---- Product list
prods=sales.groupby(['Supplier','Family','Brand','prod_num','ProdName','Package'],dropna=False).agg(ns=('net_sales','sum'),ncust=('cust_num','nunique'),cases=('cases','sum'),gp=('net_sales',lambda s: 0)).reset_index()
prods['gp']=sales.groupby(['Supplier','Family','Brand','prod_num','ProdName','Package'],dropna=False).apply(lambda g:(g['net_sales']-g['cogs']).sum()).values
prods=prods.sort_values('ns',ascending=False).reset_index(drop=True)
# ---- Customers
custs=sales.groupby(['cust_num','CustName','Rep','Area','Prem'],dropna=False).agg(ns=('net_sales','sum'),nprod=('prod_num','nunique')).reset_index().sort_values('ns',ascending=False).reset_index(drop=True)
# ---- Suppliers, families
sups=sales.groupby('Supplier')['net_sales'].sum().sort_values(ascending=False)
fams=sales.groupby(['Family'])['net_sales'].sum().sort_values(ascending=False)
# ---- ladder
lad=px.copy(); lad=lad.sort_values(['Supplier','prod_num','Min Purchase Qty_n','start']).reset_index(drop=True)
# ---- excluded
exc=df[~df['category'].isin(['Sale','Credit / return'])].copy()
exc['Ext']=df['Ext Price_n']; exc['ProdName']=exc['Product'].str.replace(r'^\S+\s','',regex=True); exc['CustName']=exc['CustName'].fillna('')
exg=exc.groupby(['category','cust_num','CustName','prod_num','ProdName'],dropna=False).agg(lines=('cases','size'),cases=('cases','sum'),units=('units','sum'),ext=('Ext','sum'),dep=('deposits','sum'),costv=('inv_value_cost','sum')).reset_index().sort_values(['category','ext'],ascending=[True,False]).reset_index(drop=True)
TREAT={'Zero-quantity line':'Excluded. Line billed at $0 with 0 cases (short-shipped / cancelled item). No sales or cost impact.',
'Zero-quantity line (no cost on file)':'Excluded. $0, 0 cases, no cost on file.',
'Empty keg / cooperage return (deposit)':'Excluded from net sales. Keg shell / cooperage returns are deposit refunds, not product sales.',
'Breakage (write-off at cost)':'Excluded from net sales (billed at $0). Reported as a memo item at laid-in cost + tax. Not charged against gross profit in the headline numbers.',
'Out-of-code (write-off at cost)':'Excluded from net sales (billed at $0). Reported as a memo item at laid-in cost + tax.',
'Samples (at cost)':'Excluded from net sales (billed at $0). Reported as a memo item at cost.',
'FIFO / inventory adjustment':'Excluded. Inventory / GL adjustments, not customer sales (includes the $53,159 GL line 998 00998).',
'Finance / NSF / write-off':'Excluded. NSF check re-bills, finance charges and AR write-offs are receivables activity, not product sales.',
'Equipment / deposit item':'Excluded. Kiosk, cold plate, trailer, gas tank and other deposit / equipment items.',
'Supplier billback invoice':'Excluded. Invoices to suppliers for billbacks (customer = supplier). Supplier funding is captured per line through the Participation column instead.',
'Too-old-for-credit zero-out / sell-back to supplier':'Excluded from net sales. Lines carrying the Encompass promotion "TOO OLD FOR CREDIT (ZERO OUT)": credits zeroed out at $0, plus the sell-back of Waterloo gin to its supplier at below cost. Reported as a memo item.',
'Product line with no cost on file':'Excluded from margin analysis: the line has a price but Encompass carries no FOB / laid-in cost, so margin cannot be measured. Listed for review.'}
exg['treat']=exg['category'].map(TREAT)
cats=exg.groupby('category').agg(lines=('lines','sum'),ext=('ext','sum')).reset_index()
cat_order=['Credit / return','Too-old-for-credit zero-out / sell-back to supplier','Breakage (write-off at cost)','Out-of-code (write-off at cost)','Samples (at cost)','FIFO / inventory adjustment','Empty keg / cooperage return (deposit)','Supplier billback invoice','Finance / NSF / write-off','Equipment / deposit item','Product line with no cost on file','Zero-quantity line','Zero-quantity line (no cost on file)']

# ================= SHEET: Sales Lines =================
ws=wb.active; ws.title='Sales Lines'
SLH=['Supplier','Brand Family','Brand','Product #','Product','Package','Customer #','Customer','Sales Rep','Area','Premise','Promotion (Encompass)','Line Type','Deal Level Match','Deal Level','Level Band','Net Price / Case','Front-line Price / Case','Discount % vs Front-line','Cases','Units','Net Sales $','Front-line Value $','Deposits $ (excluded)','COGS $','Gross Profit $','Gross Margin %','Cost / Case','GP / Case','# Invoice Lines','Match Note']
SL={h:L(i+1) for i,h in enumerate(SLH)}
title(ws,'Sales Lines - August 2026 (customer x product x price grain)','Every product sale and credit line, netted to customer x product x net price. Use the filters on row 4; the totals in row 2 follow the filter (SUBTOTAL). Net Sales exclude deposits. COGS = (Laid-in Cost + Tax Cost - Participation) x units. Sorted by customer #. Values are from the Encompass invoice export; GP and margin columns are formulas. Customer Summary sums each customer block of rows (see its From / To row columns).',len(SLH))
header(ws,4,SLH); ws.freeze_panes='E5'
N=len(agg); r0=5; rN=r0+N-1
for i,r in enumerate(agg.itertuples(index=False)):
    rr=r0+i
    vals=[r.Supplier,r.Family,r.Brand,r.prod_num,r.ProdName,r.Package,int(r.cust_num),r.CustName,r.Rep,r.Area,r.Prem,r.Promo,r.ctype,r.match_status,r.level_label,r.band,r.case_price,r.front_case,None,r.cases,r.units,r.net,r.front,r.dep,r.cogs,None,None,None,None,int(r.lines),r.note]
    ws.append(vals) if False else None
    for j,v in enumerate(vals):
        if v is not None: ws.cell(rr,j+1,v)
    ws.cell(rr,19,(1-r.case_price/r.front_case) if r.front_case else 0)
    ws.cell(rr,26,f'={SL["Net Sales $"]}{rr}-{SL["COGS $"]}{rr}')
    ws.cell(rr,27,f'=IF({SL["Net Sales $"]}{rr}=0,"",{SL["Gross Profit $"]}{rr}/{SL["Net Sales $"]}{rr})')
    if r.cases: ws.cell(rr,28,round(r.cogs/r.cases,4)); ws.cell(rr,29,round((r.net-r.cogs)/r.cases,4))
fmts={'Net Price / Case':FMT_D2,'Front-line Price / Case':FMT_D2,'Discount % vs Front-line':FMT_P,'Cases':FMT_N1,'Units':FMT_N,'Net Sales $':FMT_D0,'Front-line Value $':FMT_D0,'Deposits $ (excluded)':FMT_D0,'COGS $':FMT_D0,'Gross Profit $':FMT_D0,'Gross Margin %':FMT_P,'Cost / Case':FMT_D2,'GP / Case':FMT_D2,'# Invoice Lines':FMT_N}
for h,fm in fmts.items():
    c=SL[h]
    for rr in range(r0,rN+1): ws[f'{c}{rr}'].number_format=fm
# totals row 2
ws['A2']='Totals (follow filter)'; ws['A2'].font=f_bold
for h in ['Cases','Units','Net Sales $','Front-line Value $','Deposits $ (excluded)','COGS $','Gross Profit $']:
    c=SL[h]; ws[f'{c}2']=f'=SUBTOTAL(109,{c}{r0}:{c}{rN})'; ws[f'{c}2'].number_format=fmts[h]; ws[f'{c}2'].font=f_bold; ws[f'{c}2'].fill=fill_tot
c=SL['Gross Margin %']; ws[f'{c}2']=f'=IF({SL["Net Sales $"]}2=0,"",{SL["Gross Profit $"]}2/{SL["Net Sales $"]}2)'; ws[f'{c}2'].number_format=FMT_P; ws[f'{c}2'].font=f_bold; ws[f'{c}2'].fill=fill_tot
c=SL['GP / Case']; ws[f'{c}2']=f'=IF({SL["Cases"]}2=0,"",{SL["Gross Profit $"]}2/{SL["Cases"]}2)'; ws[f'{c}2'].number_format=FMT_D2; ws[f'{c}2'].font=f_bold; ws[f'{c}2'].fill=fill_tot
c=SL['Discount % vs Front-line']; ws[f'{c}2']=f'=IF({SL["Front-line Value $"]}2=0,"",1-{SL["Net Sales $"]}2/{SL["Front-line Value $"]}2)'; ws[f'{c}2'].number_format=FMT_P; ws[f'{c}2'].font=f_bold; ws[f'{c}2'].fill=fill_tot
ws.auto_filter.ref=f'A4:{L(len(SLH))}{rN}'
setw(ws,[24,16,22,9,40,18,10,30,16,11,12,20,13,16,18,18,11,11,11,9,9,12,12,11,12,12,10,10,10,8,45])
SLR=lambda h: f"'Sales Lines'!${SL[h]}${r0}:${SL[h]}${rN}"

# ================= SHEET: Deal Ladder (Export) =================
wl=wb.create_sheet('Deal Ladder (Export)')
LH=['Supplier','Product #','Product','Deal Level (min cases)','Case Price $','Deal Start','Deal End','Export Cases','FOB $','Tax $','Participation $','Laid-in Cost $ (export)','Export Gross $','Export Margin %']
LD={h:L(i+1) for i,h in enumerate(LH)}
title(wl,'Deal Ladder - Encompass "Pricing Analysis RDE by Month" export (August 2026)','One row per product x deal level (Min Purchase Qty) x deal window, exactly as exported. Level 0 = front-line / no minimum. Spirits rows: FOB / laid-in are per bottle while the case price is per case (see Read Me).',len(LH))
header(wl,4,LH); wl.freeze_panes='D5'
l0=5; lN=l0+len(lad)-1
for i,(_,r) in enumerate(lad.iterrows()):
    rr=l0+i
    mg=r['Margin %_n']
    vals=[r['Supplier'],r['prod_num'],re.sub(r'^\S+\s','',r['Product Num & Name']),int(r['Min Purchase Qty_n']),r['Case Unit Price_n'],r['start'].to_pydatetime(),r['end'].to_pydatetime(),r['Cases_n'],r['FOB_n'],r['Tax_n'],r['Participation_n'],r['Laid-in Cost_n'],r['Gross_n'],(mg/100.0 if mg==mg else None)]
    for j,v in enumerate(vals):
        if v is not None and not (isinstance(v,float) and np.isnan(v)): wl.cell(rr,j+1,v)
    for h,fm in {'Case Price $':FMT_D2,'FOB $':FMT_D2,'Tax $':FMT_D2,'Participation $':FMT_D2,'Laid-in Cost $ (export)':FMT_D2,'Export Gross $':FMT_D0,'Export Cases':FMT_N,'Export Margin %':FMT_P}.items(): wl[f'{LD[h]}{rr}'].number_format=fm
    wl[f'F{rr}'].number_format='m/d/yyyy'; wl[f'G{rr}'].number_format='m/d/yyyy'
wl.auto_filter.ref=f'A4:{L(len(LH))}{lN}'
setw(wl,[26,9,44,10,10,11,11,10,9,8,10,11,12,10])
LR=lambda h: f"'Deal Ladder (Export)'!${LD[h]}${l0}:${LD[h]}${lN}"

# ================= SHEET: Brand Family Map =================
wm=wb.create_sheet('Brand Family Map')
MH=['Product #','Product','Supplier','Brand','Brand Family (editable)','Package']
title(wm,'Brand Family Map','Brand and Package are split off the product name (as in the Pricing Deal Levels workbook). Brand Family is a derived roll-up (first word / known two-word families). Blue cells are editable: change a family here and Product Summary + Brand Family Summary recalculate.',len(MH))
header(wm,4,MH); wm.freeze_panes='C5'
m0=5
plist=prods[['prod_num','ProdName','Supplier','Brand','Family','Package']].sort_values(['Supplier','Family','prod_num'])
mN=m0+len(plist)-1
for i,r in enumerate(plist.itertuples(index=False)):
    rr=m0+i
    for j,v in enumerate(r): wm.cell(rr,j+1,v)
    wm.cell(rr,5).font=f_input
wm.auto_filter.ref=f'A4:F{mN}'; setw(wm,[10,44,26,26,22,18])
MAP=lambda col: f"'Brand Family Map'!${col}${m0}:${col}${mN}"

# ================= SHEET: Opportunities (thresholds first, lists later) =================
wo=wb.create_sheet('Opportunities')
title(wo,'Opportunities & Review List - August 2026','Thresholds (blue) drive the flag columns on Product Summary, Deal Level Analysis and Customer Summary. The ranked lists below are a snapshot ranked at build time; the live, filterable versions are the flag columns on those sheets.',14)
wo['A4']='Review thresholds (edit the blue cells)'; wo['A4'].font=f_sec
thr=[('Low-margin threshold (gross margin % below this is flagged)',0.20,FMT_P,'thr_low'),('Deep-discount threshold (discount % vs front-line above this is flagged)',0.12,FMT_P,'thr_disc'),('Minimum net sales for a product / customer to appear in review lists ($)',5000,FMT_D0,'thr_min'),('High share at deepest tier (share of a product\'s cases sold at its lowest price; products with 100+ cases and 3+ price points)',0.60,FMT_P,'thr_deep')]
TH={}
for i,(lab,v,fm,key) in enumerate(thr):
    rr=5+i; wo.cell(rr,1,lab).font=f_norm; c=wo.cell(rr,4,v); c.font=f_input; c.fill=fill_in; c.number_format=fm; TH[key]=f"Opportunities!$D${rr}"
wo['A10']='Flag counts (live)'; wo['A10'].font=f_sec

# ================= SHEET: Deal Level Analysis =================
wd=wb.create_sheet('Deal Level Analysis')
DH=['Supplier','Brand Family','Brand','Product #','Product','Package','Deal Level Match','Deal Level','Level (min cases)','Level Band','Candidate Levels','Net Price / Case','Front-line Price / Case (invoice)','Discount $ / Case','Discount % vs Front-line','Cases','Units','Net Sales $','Front-line Value $','Discount $ Given','COGS $','Gross Profit $','Gross Margin %','GP / Case','Cost / Case','Share of Product Cases','Published Front-line (highest level price)','Published Deepest Price','Published Price at this Level','Price vs Published','# Customers','# Invoice Lines','Flags']
DL={h:L(i+1) for i,h in enumerate(DH)}
title(wd,'Deal Level Analysis - actual selling price vs front-line and published deal tiers (August 2026)','One row per product x identified deal level x net price. "Identified" = the net price matches exactly one published level in a window covering the invoice date. "Ambiguous" = two or more published levels carry the same price on that date (price and margin are still exact; only the tier label is uncertain). "Not on deal sheet" = the price appears on no published level. Cases / sales / cost are summed from Sales Lines; everything else is a formula.',len(DH))
header(wd,4,DH); wd.freeze_panes='F5'
d0=5; dN=d0+len(dla)-1
for i,r in enumerate(dla.itertuples(index=False)):
    rr=d0+i
    lv=int(r.level_num) if r.level_num==r.level_num else None
    cand=str(r.level_raw) if (r.match_status in ('Ambiguous','Outside window')) else (str(lv) if lv is not None else '')
    vals={'Supplier':r.Supplier,'Brand Family':r.Family,'Brand':r.Brand,'Product #':r.prod_num,'Product':r.ProdName,'Package':r.Package,'Deal Level Match':r.match_status,'Deal Level':r.level_label,'Level (min cases)':lv,'Level Band':r.band,'Candidate Levels':cand,'Net Price / Case':r.case_price,'Front-line Price / Case (invoice)':r.front_case,'Cases':r.cases,'Units':r.units,'Net Sales $':r.net,'Front-line Value $':r.front,'COGS $':r.cogs,'# Customers':int(r.ncust),'# Invoice Lines':int(r.lines)}
    for h,v in vals.items():
        if v is not None: wd[f'{DL[h]}{rr}']=v
    P=lambda h: f'{DL[h]}{rr}'
    wd[P('Discount $ / Case')]=f'={P("Front-line Price / Case (invoice)")}-{P("Net Price / Case")}'
    wd[P('Discount % vs Front-line')]=f'=IF({P("Front-line Price / Case (invoice)")}=0,0,{P("Discount $ / Case")}/{P("Front-line Price / Case (invoice)")})'
    wd[P('Discount $ Given')]=f'={P("Front-line Value $")}-{P("Net Sales $")}'
    wd[P('Gross Profit $')]=f'={P("Net Sales $")}-{P("COGS $")}'
    wd[P('Gross Margin %')]=f'=IF({P("Net Sales $")}=0,"",{P("Gross Profit $")}/{P("Net Sales $")})'
    wd[P('GP / Case')]=f'=IF({P("Cases")}=0,"",{P("Gross Profit $")}/{P("Cases")})'
    wd[P('Cost / Case')]=f'=IF({P("Cases")}=0,"",{P("COGS $")}/{P("Cases")})'
    wd[P('Share of Product Cases')]=f'=IF(SUMIFS(${DL["Cases"]}${d0}:${DL["Cases"]}${dN},${DL["Product #"]}${d0}:${DL["Product #"]}${dN},{P("Product #")})=0,"",{P("Cases")}/SUMIFS(${DL["Cases"]}${d0}:${DL["Cases"]}${dN},${DL["Product #"]}${d0}:${DL["Product #"]}${dN},{P("Product #")}))'
    wd[P('Published Front-line (highest level price)')]=f'=IF(COUNTIFS({LR("Product #")},{P("Product #")})=0,"",_xlfn.MAXIFS({LR("Case Price $")},{LR("Product #")},{P("Product #")}))'
    wd[P('Published Deepest Price')]=f'=IF(COUNTIFS({LR("Product #")},{P("Product #")})=0,"",_xlfn.MINIFS({LR("Case Price $")},{LR("Product #")},{P("Product #")}))'
    wd[P('Published Price at this Level')]=f'=IF({P("Level (min cases)")}="","",IFERROR(_xlfn.MAXIFS({LR("Case Price $")},{LR("Product #")},{P("Product #")},{LR("Deal Level (min cases)")},{P("Level (min cases)")}),""))'
    wd[P('Price vs Published')]=f'=IF({P("Published Price at this Level")}="","",{P("Net Price / Case")}-{P("Published Price at this Level")})'
    wd[P('Flags')]=(f'=IF({P("Net Sales $")}<0,"Net credit (credits exceed sales); ","")&IF({P("Deal Level Match")}="Not on deal sheet","Price not on deal sheet; ","")'
        f'&IF({P("Deal Level Match")}="Ambiguous","Level ambiguous; ","")'
        f'&IF({P("Deal Level Match")}="Outside window","Outside deal window; ","")'
        f'&IF(AND({P("Net Sales $")}>0,{P("Gross Profit $")}<0),"NEGATIVE margin; ","")'
        f'&IF(AND({P("Net Sales $")}>0,N({P("Gross Margin %")})<{TH["thr_low"]}),"Low margin; ","")'
        f'&IF(AND({P("Net Sales $")}>0,{P("Discount % vs Front-line")}>{TH["thr_disc"]}),"Deep discount; ","")'
        f'&IF(AND({P("Published Deepest Price")}<>"",{P("Net Price / Case")}<N({P("Published Deepest Price")})-0.01),"Below deepest published tier; ","")'
        f'&IF(AND({P("Front-line Price / Case (invoice)")}>0,{P("Net Price / Case")}>{P("Front-line Price / Case (invoice)")}+0.01),"Above front-line; ","")'
        f'&IF(AND({P("Price vs Published")}<>"",ABS(N({P("Price vs Published")}))>0.01),"Differs from published level price; ","")')
    for h,fm in {'Net Price / Case':FMT_D2,'Front-line Price / Case (invoice)':FMT_D2,'Discount $ / Case':FMT_D2,'Discount % vs Front-line':FMT_P,'Cases':FMT_N1,'Units':FMT_N,'Net Sales $':FMT_D0,'Front-line Value $':FMT_D0,'Discount $ Given':FMT_D0,'COGS $':FMT_D0,'Gross Profit $':FMT_D0,'Gross Margin %':FMT_P,'GP / Case':FMT_D2,'Cost / Case':FMT_D2,'Share of Product Cases':FMT_P,'Published Front-line (highest level price)':FMT_D2,'Published Deepest Price':FMT_D2,'Published Price at this Level':FMT_D2,'Price vs Published':FMT_D2,'# Customers':FMT_N,'# Invoice Lines':FMT_N,'Level (min cases)':'0'}.items(): wd[f'{DL[h]}{rr}'].number_format=fm
wd['A2'].value=wd['A2'].value; wd['A3']='Totals (follow filter)'; wd['A3'].font=f_bold
for h in ['Cases','Units','Net Sales $','Front-line Value $','Discount $ Given','COGS $','Gross Profit $']:
    c=DL[h]; wd[f'{c}3']=f'=SUBTOTAL(109,{c}{d0}:{c}{dN})'; wd[f'{c}3'].number_format=FMT_D0 if '$' in h else FMT_N; wd[f'{c}3'].font=f_bold; wd[f'{c}3'].fill=fill_tot
c=DL['Gross Margin %']; wd[f'{c}3']=f'=IF({DL["Net Sales $"]}3=0,"",{DL["Gross Profit $"]}3/{DL["Net Sales $"]}3)'; wd[f'{c}3'].number_format=FMT_P; wd[f'{c}3'].font=f_bold; wd[f'{c}3'].fill=fill_tot
c=DL['Discount % vs Front-line']; wd[f'{c}3']=f'=IF({DL["Front-line Value $"]}3=0,"",{DL["Discount $ Given"]}3/{DL["Front-line Value $"]}3)'; wd[f'{c}3'].number_format=FMT_P; wd[f'{c}3'].font=f_bold; wd[f'{c}3'].fill=fill_tot
wd.auto_filter.ref=f'A4:{L(len(DH))}{dN}'
setw(wd,[24,16,22,9,40,18,15,18,9,16,12,11,11,10,10,9,9,12,12,11,12,12,10,10,10,10,12,11,11,10,9,8,50])
DR=lambda h: f"'Deal Level Analysis'!${DL[h]}${d0}:${DL[h]}${dN}"

# ================= SHEET: Product Summary =================
wp=wb.create_sheet('Product Summary')
PH=['Supplier','Brand Family','Brand','Product #','Product','Package','Cases','Net Sales $','COGS $','Gross Profit $','Gross Margin %','GP / Case','Avg Net Price / Case','Cost / Case','Published Front-line (highest level price)','Published Deepest Price','Avg Discount % vs Front-line (invoice)','Discount $ Given','Cases at Front-line (level 0)','% Cases on a Deal Price','Cases - Level Ambiguous','Cases - Not Identified','Share of Cases at Deepest Price','# Customers','# Deal-level Rows','Share of Company Net Sales','Share of Company GP','Flags']
PL={h:L(i+1) for i,h in enumerate(PH)}
title(wp,'Product Summary - margin by product (August 2026)','All numbers are SUMIFS over Deal Level Analysis (which sums Sales Lines). Aggregate margin = total GP / total net sales. Brand Family is looked up from the Brand Family Map. Filter on row 4.',len(PH))
header(wp,4,PH); wp.freeze_panes='F5'
p0=5; pN=p0+len(prods)-1
for i,r in enumerate(prods.itertuples(index=False)):
    rr=p0+i; P=lambda h: f'{PL[h]}{rr}'
    wp[P('Supplier')]=r.Supplier; wp[P('Brand')]=r.Brand; wp[P('Product #')]=r.prod_num; wp[P('Product')]=r.ProdName; wp[P('Package')]=r.Package
    wp[P('Brand Family')]=f'=IFERROR(INDEX({MAP("E")},MATCH({P("Product #")},{MAP("A")},0)),"")'; wp[P('Brand Family')].font=f_link
    S=lambda h: f'SUMIFS({DR(h)},{DR("Product #")},{P("Product #")})'
    wp[P('Cases')]=f'={S("Cases")}'; wp[P('Net Sales $')]=f'={S("Net Sales $")}'; wp[P('COGS $')]=f'={S("COGS $")}'
    wp[P('Gross Profit $')]=f'={P("Net Sales $")}-{P("COGS $")}'
    wp[P('Gross Margin %')]=f'=IF({P("Net Sales $")}=0,"",{P("Gross Profit $")}/{P("Net Sales $")})'
    wp[P('GP / Case')]=f'=IF({P("Cases")}=0,"",{P("Gross Profit $")}/{P("Cases")})'
    wp[P('Avg Net Price / Case')]=f'=IF({P("Cases")}=0,"",{P("Net Sales $")}/{P("Cases")})'
    wp[P('Cost / Case')]=f'=IF({P("Cases")}=0,"",{P("COGS $")}/{P("Cases")})'
    wp[P('Published Front-line (highest level price)')]=f'=IF(COUNTIFS({LR("Product #")},{P("Product #")})=0,"",_xlfn.MAXIFS({LR("Case Price $")},{LR("Product #")},{P("Product #")}))'
    wp[P('Published Deepest Price')]=f'=IF(COUNTIFS({LR("Product #")},{P("Product #")})=0,"",_xlfn.MINIFS({LR("Case Price $")},{LR("Product #")},{P("Product #")}))'
    wp[P('Discount $ Given')]=f'={S("Discount $ Given")}'
    wp[P('Avg Discount % vs Front-line (invoice)')]=f'=IF({S("Front-line Value $")}=0,"",{P("Discount $ Given")}/{S("Front-line Value $")})'
    wp[P('Cases at Front-line (level 0)')]=f'=SUMIFS({DR("Cases")},{DR("Product #")},{P("Product #")},{DR("Level Band")},"0 (front-line)")'
    wp[P('% Cases on a Deal Price')]=f'=IF({P("Cases")}=0,"",1-{P("Cases at Front-line (level 0)")}/{P("Cases")})'
    wp[P('Cases - Level Ambiguous')]=f'=SUMIFS({DR("Cases")},{DR("Product #")},{P("Product #")},{DR("Deal Level Match")},"Ambiguous")'
    wp[P('Cases - Not Identified')]=f'=SUMIFS({DR("Cases")},{DR("Product #")},{P("Product #")},{DR("Deal Level Match")},"Not on deal sheet")+SUMIFS({DR("Cases")},{DR("Product #")},{P("Product #")},{DR("Deal Level Match")},"Outside window")'
    wp[P('Share of Cases at Deepest Price')]=f'=IF({P("Cases")}=0,"",SUMIFS({DR("Cases")},{DR("Product #")},{P("Product #")},{DR("Net Price / Case")},_xlfn.MINIFS({DR("Net Price / Case")},{DR("Product #")},{P("Product #")},{DR("Cases")},">0"))/{P("Cases")})'
    wp[P('# Customers')]=int(r.ncust)
    wp[P('# Deal-level Rows')]=f'=COUNTIFS({DR("Product #")},{P("Product #")})'
    wp[P('Share of Company Net Sales')]=f'=IF(${PL["Net Sales $"]}$3=0,"",{P("Net Sales $")}/${PL["Net Sales $"]}$3)'
    wp[P('Share of Company GP')]=f'=IF(${PL["Gross Profit $"]}$3=0,"",{P("Gross Profit $")}/${PL["Gross Profit $"]}$3)'
    wp[P('Flags')]=(f'=IF({P("Net Sales $")}<0,"Net credit (credits exceed sales); ","")&IF(AND({P("Net Sales $")}>0,{P("Gross Profit $")}<0),"NEGATIVE margin; ","")'
        f'&IF(AND({P("Net Sales $")}>0,N({P("Gross Margin %")})<{TH["thr_low"]}),"Low margin; ","")'
        f'&IF(AND({P("Avg Discount % vs Front-line (invoice)")}<>"",N({P("Avg Discount % vs Front-line (invoice)")})>{TH["thr_disc"]}),"Deep avg discount; ","")'
        f'&IF(AND({P("Share of Cases at Deepest Price")}<>"",N({P("Share of Cases at Deepest Price")})>{TH["thr_deep"]},{P("Cases")}>=100,{P("# Deal-level Rows")}>=3),"Most volume at deepest price; ","")'
        f'&IF({P("Cases - Not Identified")}<>0,"Has prices not on deal sheet; ","")'
        f'&IF({P("Supplier")}="Not in pricing export","Product missing from pricing export; ","")')
    for h,fm in {'Cases':FMT_N1,'Net Sales $':FMT_D0,'COGS $':FMT_D0,'Gross Profit $':FMT_D0,'Gross Margin %':FMT_P,'GP / Case':FMT_D2,'Avg Net Price / Case':FMT_D2,'Cost / Case':FMT_D2,'Published Front-line (highest level price)':FMT_D2,'Published Deepest Price':FMT_D2,'Avg Discount % vs Front-line (invoice)':FMT_P,'Discount $ Given':FMT_D0,'Cases at Front-line (level 0)':FMT_N1,'% Cases on a Deal Price':FMT_P,'Cases - Level Ambiguous':FMT_N1,'Cases - Not Identified':FMT_N1,'Share of Cases at Deepest Price':FMT_P,'# Customers':FMT_N,'# Deal-level Rows':FMT_N,'Share of Company Net Sales':FMT_P,'Share of Company GP':FMT_P}.items(): wp[f'{PL[h]}{rr}'].number_format=fm
wp['A3']='Totals (all products)'; wp['A3'].font=f_bold
for h in ['Cases','Net Sales $','COGS $','Gross Profit $','Discount $ Given','Cases at Front-line (level 0)','Cases - Level Ambiguous','Cases - Not Identified']:
    c=PL[h]; wp[f'{c}3']=f'=SUM({c}{p0}:{c}{pN})'; wp[f'{c}3'].number_format=FMT_D0 if '$' in h else FMT_N; wp[f'{c}3'].font=f_bold; wp[f'{c}3'].fill=fill_tot
c=PL['Gross Margin %']; wp[f'{c}3']=f'=IF({PL["Net Sales $"]}3=0,"",{PL["Gross Profit $"]}3/{PL["Net Sales $"]}3)'; wp[f'{c}3'].number_format=FMT_P; wp[f'{c}3'].font=f_bold; wp[f'{c}3'].fill=fill_tot
c=PL['GP / Case']; wp[f'{c}3']=f'=IF({PL["Cases"]}3=0,"",{PL["Gross Profit $"]}3/{PL["Cases"]}3)'; wp[f'{c}3'].number_format=FMT_D2; wp[f'{c}3'].font=f_bold; wp[f'{c}3'].fill=fill_tot
wp.auto_filter.ref=f'A4:{L(len(PH))}{pN}'
setw(wp,[24,16,22,9,40,18,9,12,12,12,9,9,10,9,11,11,11,11,10,10,10,10,10,8,8,9,9,50])
PR=lambda h: f"'Product Summary'!${PL[h]}${p0}:${PL[h]}${pN}"

# ================= SHEET: Supplier Summary & Brand Family Summary =================
def group_sheet(name,keyhdr,keycol_in_prod,keys,ttl,sub):
    w=wb.create_sheet(name)
    H=[keyhdr,'# Products','Cases','Net Sales $','COGS $','Gross Profit $','Gross Margin %','GP / Case','Avg Net Price / Case','Discount $ Given','Avg Discount % vs Front-line','% Cases on a Deal Price','Share of Company Net Sales','Share of Company GP','Margin vs Company (pts)','Flags']
    C={h:L(i+1) for i,h in enumerate(H)}
    title(w,ttl,sub,len(H)); header(w,4,H); w.freeze_panes='B5'
    g0=5; gN=g0+len(keys)-1
    for i,k in enumerate(keys):
        rr=g0+i; P=lambda h: f'{C[h]}{rr}'
        w[P(keyhdr)]=k
        S=lambda h: f'SUMIFS({PR(h)},{PR(keycol_in_prod)},{P(keyhdr)})'
        w[P('# Products')]=f'=COUNTIFS({PR(keycol_in_prod)},{P(keyhdr)})'
        w[P('Cases')]=f'={S("Cases")}'; w[P('Net Sales $')]=f'={S("Net Sales $")}'; w[P('COGS $')]=f'={S("COGS $")}'
        w[P('Gross Profit $')]=f'={P("Net Sales $")}-{P("COGS $")}'
        w[P('Gross Margin %')]=f'=IF({P("Net Sales $")}=0,"",{P("Gross Profit $")}/{P("Net Sales $")})'
        w[P('GP / Case')]=f'=IF({P("Cases")}=0,"",{P("Gross Profit $")}/{P("Cases")})'
        w[P('Avg Net Price / Case')]=f'=IF({P("Cases")}=0,"",{P("Net Sales $")}/{P("Cases")})'
        w[P('Discount $ Given')]=f'={S("Discount $ Given")}'
        w[P('Avg Discount % vs Front-line')]=f'=IF({P("Net Sales $")}+{P("Discount $ Given")}=0,"",{P("Discount $ Given")}/({P("Net Sales $")}+{P("Discount $ Given")}))'
        w[P('% Cases on a Deal Price')]=f'=IF({P("Cases")}=0,"",1-{S("Cases at Front-line (level 0)")}/{P("Cases")})'
        w[P('Share of Company Net Sales')]=f'=IF(${C["Net Sales $"]}$3=0,"",{P("Net Sales $")}/${C["Net Sales $"]}$3)'
        w[P('Share of Company GP')]=f'=IF(${C["Gross Profit $"]}$3=0,"",{P("Gross Profit $")}/${C["Gross Profit $"]}$3)'
        w[P('Margin vs Company (pts)')]=f'=IF({P("Gross Margin %")}="","",{P("Gross Margin %")}-${C["Gross Margin %"]}$3)'
        w[P('Flags')]=f'=IF({P("Net Sales $")}<0,"Net credit; ","")&IF(AND({P("Net Sales $")}>0,{P("Gross Profit $")}<0),"NEGATIVE margin; ","")&IF(AND({P("Net Sales $")}>0,N({P("Gross Margin %")})<{TH["thr_low"]}),"Low margin; ","")&IF(AND({P("Avg Discount % vs Front-line")}<>"",N({P("Avg Discount % vs Front-line")})>{TH["thr_disc"]}),"Deep avg discount; ","")'
        for h,fm in {'# Products':FMT_N,'Cases':FMT_N,'Net Sales $':FMT_D0,'COGS $':FMT_D0,'Gross Profit $':FMT_D0,'Gross Margin %':FMT_P,'GP / Case':FMT_D2,'Avg Net Price / Case':FMT_D2,'Discount $ Given':FMT_D0,'Avg Discount % vs Front-line':FMT_P,'% Cases on a Deal Price':FMT_P,'Share of Company Net Sales':FMT_P,'Share of Company GP':FMT_P,'Margin vs Company (pts)':FMT_P}.items(): w[f'{C[h]}{rr}'].number_format=fm
    w['A3']='Totals'; w['A3'].font=f_bold
    for h in ['# Products','Cases','Net Sales $','COGS $','Gross Profit $','Discount $ Given']:
        c=C[h]; w[f'{c}3']=f'=SUM({c}{g0}:{c}{gN})'; w[f'{c}3'].number_format=FMT_D0 if '$' in h else FMT_N; w[f'{c}3'].font=f_bold; w[f'{c}3'].fill=fill_tot
    c=C['Gross Margin %']; w[f'{c}3']=f'=IF({C["Net Sales $"]}3=0,"",{C["Gross Profit $"]}3/{C["Net Sales $"]}3)'; w[f'{c}3'].number_format=FMT_P; w[f'{c}3'].font=f_bold; w[f'{c}3'].fill=fill_tot
    c=C['GP / Case']; w[f'{c}3']=f'=IF({C["Cases"]}3=0,"",{C["Gross Profit $"]}3/{C["Cases"]}3)'; w[f'{c}3'].number_format=FMT_D2; w[f'{c}3'].font=f_bold; w[f'{c}3'].fill=fill_tot
    c=C['Avg Discount % vs Front-line']; w[f'{c}3']=f'=IF({C["Net Sales $"]}3+{C["Discount $ Given"]}3=0,"",{C["Discount $ Given"]}3/({C["Net Sales $"]}3+{C["Discount $ Given"]}3))'; w[f'{c}3'].number_format=FMT_P; w[f'{c}3'].font=f_bold; w[f'{c}3'].fill=fill_tot
    w.auto_filter.ref=f'A4:{L(len(H))}{gN}'
    setw(w,[30,9,10,13,13,13,10,9,10,12,11,11,11,11,11,40])
    return w,C,g0,gN
wsup,SC_,s0,sN=group_sheet('Supplier Summary','Supplier','Supplier',list(sups.index),'Supplier Summary - margin by supplier (August 2026)','SUMIFS over Product Summary. Sorted by net sales. Aggregate margin = total GP / total net sales (never an average of product margins). "Not in pricing export" = products sold in August that the pricing export does not carry.')
wfam,FC_,f0,fN=group_sheet('Brand Family Summary','Brand Family','Brand Family',list(fams.index),'Brand Family Summary - margin by brand family (August 2026)','SUMIFS over Product Summary, keyed on the (editable) Brand Family Map. Brand family is derived from the product name - see Read Me.')

# ================= SHEET: Customer Summary =================
wc=wb.create_sheet('Customer Summary')
CH=['Customer #','Customer','Sales Rep','Area','Premise','# Products','Cases','Net Sales $','COGS $','Gross Profit $','Gross Margin %','GP / Case','Discount $ Given','Avg Discount % vs Front-line','Credits / Returns $ (in net)','Share of Company Net Sales','Margin vs Company (pts)','Flags','Sales Lines: From Row','Sales Lines: To Row']
CC={h:L(i+1) for i,h in enumerate(CH)}
title(wc,'Customer Summary - margin by account (August 2026)','Each row sums its customer\'s block of rows on Sales Lines (which is sorted by customer #; the From / To row pointers in the last two columns mark the block). Rep / Area / Premise come from the hub rep-customer base (hub/data/accounts.js, as of 2026-09-10); accounts not in that file show "(not in rep base)". Credits / returns are already netted into Net Sales and COGS.',len(CH))
header(wc,4,CH); wc.freeze_panes='C5'
c0=5; cN=c0+len(custs)-1
for i,r in enumerate(custs.itertuples(index=False)):
    rr=c0+i; P=lambda h: f'{CC[h]}{rr}'
    wc[P('Customer #')]=int(r.cust_num); wc[P('Customer')]=r.CustName; wc[P('Sales Rep')]=r.Rep; wc[P('Area')]=r.Area; wc[P('Premise')]=r.Prem; wc[P('# Products')]=int(r.nprod)
    fr,to=cust_rows[int(r.cust_num)]
    wc[P('Sales Lines: From Row')]=fr; wc[P('Sales Lines: To Row')]=to
    S=lambda h: f"SUM(INDEX('Sales Lines'!${SL[h]}:${SL[h]},{P('Sales Lines: From Row')}):INDEX('Sales Lines'!${SL[h]}:${SL[h]},{P('Sales Lines: To Row')}))"
    wc[P('Cases')]=f'={S("Cases")}'; wc[P('Net Sales $')]=f'={S("Net Sales $")}'; wc[P('COGS $')]=f'={S("COGS $")}'
    wc[P('Gross Profit $')]=f'={P("Net Sales $")}-{P("COGS $")}'
    wc[P('Gross Margin %')]=f'=IF({P("Net Sales $")}=0,"",{P("Gross Profit $")}/{P("Net Sales $")})'
    wc[P('GP / Case')]=f'=IF({P("Cases")}=0,"",{P("Gross Profit $")}/{P("Cases")})'
    wc[P('Discount $ Given')]=f'={S("Front-line Value $")}-{P("Net Sales $")}'
    wc[P('Avg Discount % vs Front-line')]=f'=IF({S("Front-line Value $")}=0,"",{P("Discount $ Given")}/{S("Front-line Value $")})'
    wc[P('Credits / Returns $ (in net)')]=f"=SUMIFS(INDEX('Sales Lines'!${SL['Net Sales $']}:${SL['Net Sales $']},{P('Sales Lines: From Row')}):INDEX('Sales Lines'!${SL['Net Sales $']}:${SL['Net Sales $']},{P('Sales Lines: To Row')}),INDEX('Sales Lines'!${SL['Line Type']}:${SL['Line Type']},{P('Sales Lines: From Row')}):INDEX('Sales Lines'!${SL['Line Type']}:${SL['Line Type']},{P('Sales Lines: To Row')}),\"Credit / return\")"
    wc[P('Share of Company Net Sales')]=f'=IF(${CC["Net Sales $"]}$3=0,"",{P("Net Sales $")}/${CC["Net Sales $"]}$3)'
    wc[P('Margin vs Company (pts)')]=f'=IF({P("Gross Margin %")}="","",{P("Gross Margin %")}-${CC["Gross Margin %"]}$3)'
    wc[P('Flags')]=f'=IF({P("Net Sales $")}<0,"Net credit (credits exceed sales); ","")&IF(AND({P("Net Sales $")}>0,{P("Gross Profit $")}<0),"NEGATIVE margin; ","")&IF(AND({P("Net Sales $")}>={TH["thr_min"]},N({P("Gross Margin %")})<{TH["thr_low"]}),"Low margin; ","")&IF(AND({P("Net Sales $")}>={TH["thr_min"]},{P("Avg Discount % vs Front-line")}<>"",N({P("Avg Discount % vs Front-line")})>{TH["thr_disc"]}),"Deep avg discount; ","")&IF({P("Credits / Returns $ (in net)")}<-500,"Credits > $500; ","")'
    for h,fm in {'# Products':FMT_N,'Cases':FMT_N1,'Net Sales $':FMT_D0,'COGS $':FMT_D0,'Gross Profit $':FMT_D0,'Gross Margin %':FMT_P,'GP / Case':FMT_D2,'Discount $ Given':FMT_D0,'Avg Discount % vs Front-line':FMT_P,'Credits / Returns $ (in net)':FMT_D0,'Share of Company Net Sales':FMT_P,'Margin vs Company (pts)':FMT_P}.items(): wc[f'{CC[h]}{rr}'].number_format=fm
wc['A3']='Totals'; wc['A3'].font=f_bold
for h in ['Cases','Net Sales $','COGS $','Gross Profit $','Discount $ Given','Credits / Returns $ (in net)']:
    c=CC[h]; wc[f'{c}3']=f'=SUM({c}{c0}:{c}{cN})'; wc[f'{c}3'].number_format=FMT_D0 if '$' in h else FMT_N; wc[f'{c}3'].font=f_bold; wc[f'{c}3'].fill=fill_tot
c=CC['Gross Margin %']; wc[f'{c}3']=f'=IF({CC["Net Sales $"]}3=0,"",{CC["Gross Profit $"]}3/{CC["Net Sales $"]}3)'; wc[f'{c}3'].number_format=FMT_P; wc[f'{c}3'].font=f_bold; wc[f'{c}3'].fill=fill_tot
c=CC['GP / Case']; wc[f'{c}3']=f'=IF({CC["Cases"]}3=0,"",{CC["Gross Profit $"]}3/{CC["Cases"]}3)'; wc[f'{c}3'].number_format=FMT_D2; wc[f'{c}3'].font=f_bold; wc[f'{c}3'].fill=fill_tot
wc.auto_filter.ref=f'A4:{L(len(CH))}{cN}'
setw(wc,[10,32,16,11,12,8,9,12,12,12,9,9,11,11,11,10,10,40,9,9])
CR=lambda h: f"'Customer Summary'!${CC[h]}${c0}:${CC[h]}${cN}"

# ================= SHEET: Deal Band Summary =================
wbnd=wb.create_sheet('Deal Band Summary')
BH=['Level Band (min cases to earn the price)','# Product-Level Rows','Cases','% of Cases','Units','Net Sales $','% of Net Sales','Front-line Value $','Discount $ Given','Avg Discount % vs Front-line','COGS $','Gross Profit $','Gross Margin %','GP / Case','Margin vs Company (pts)']
BC={h:L(i+1) for i,h in enumerate(BH)}
title(wbnd,'Deal Band Summary - volume, sales and margin by deal tier (August 2026)','SUMIFS over Deal Level Analysis. "0 (front-line)" = sold at a published level-0 price. "Deal price - level ambiguous" = sold at a published deal price that two or more tiers share (margin is exact, tier label is not). Bands are the Min Purchase Qty of the identified tier.',len(BH))
header(wbnd,4,BH); wbnd.freeze_panes='B5'
bands=['0 (front-line)','1-4','5-9','10-24','25-49','50-99','100-199','200+','Deal price - level ambiguous','Deal price - outside window','Not identified']
b0=5; bN=b0+len(bands)-1
for i,b in enumerate(bands):
    rr=b0+i; P=lambda h: f'{BC[h]}{rr}'
    wbnd[P(BH[0])]=b
    S=lambda h: f'SUMIFS({DR(h)},{DR("Level Band")},{P(BH[0])})'
    wbnd[P('# Product-Level Rows')]=f'=COUNTIFS({DR("Level Band")},{P(BH[0])})'
    for h in ['Cases','Units','Net Sales $','Front-line Value $','Discount $ Given','COGS $']: wbnd[P(h)]=f'={S(h)}'
    wbnd[P('% of Cases')]=f'=IF(${BC["Cases"]}${bN+1}=0,"",{P("Cases")}/${BC["Cases"]}${bN+1})'
    wbnd[P('% of Net Sales')]=f'=IF(${BC["Net Sales $"]}${bN+1}=0,"",{P("Net Sales $")}/${BC["Net Sales $"]}${bN+1})'
    wbnd[P('Avg Discount % vs Front-line')]=f'=IF({P("Front-line Value $")}=0,"",{P("Discount $ Given")}/{P("Front-line Value $")})'
    wbnd[P('Gross Profit $')]=f'={P("Net Sales $")}-{P("COGS $")}'
    wbnd[P('Gross Margin %')]=f'=IF({P("Net Sales $")}=0,"",{P("Gross Profit $")}/{P("Net Sales $")})'
    wbnd[P('GP / Case')]=f'=IF({P("Cases")}=0,"",{P("Gross Profit $")}/{P("Cases")})'
    wbnd[P('Margin vs Company (pts)')]=f'=IF({P("Gross Margin %")}="","",{P("Gross Margin %")}-${BC["Gross Margin %"]}${bN+1})'
rr=bN+1; P=lambda h: f'{BC[h]}{rr}'
wbnd[P(BH[0])]='Total'
for h in ['# Product-Level Rows','Cases','Units','Net Sales $','Front-line Value $','Discount $ Given','COGS $','Gross Profit $']: wbnd[P(h)]=f'=SUM({BC[h]}{b0}:{BC[h]}{bN})'
wbnd[P('Gross Margin %')]=f'=IF({P("Net Sales $")}=0,"",{P("Gross Profit $")}/{P("Net Sales $")})'
wbnd[P('GP / Case')]=f'=IF({P("Cases")}=0,"",{P("Gross Profit $")}/{P("Cases")})'
wbnd[P('Avg Discount % vs Front-line')]=f'=IF({P("Front-line Value $")}=0,"",{P("Discount $ Given")}/{P("Front-line Value $")})'
wbnd[P('% of Cases')]=f'=IF({P("Cases")}=0,"",1)'; wbnd[P('% of Net Sales')]=f'=IF({P("Net Sales $")}=0,"",1)'
for rr in range(b0,bN+2):
    for h,fm in {'# Product-Level Rows':FMT_N,'Cases':FMT_N,'% of Cases':FMT_P,'Units':FMT_N,'Net Sales $':FMT_D0,'% of Net Sales':FMT_P,'Front-line Value $':FMT_D0,'Discount $ Given':FMT_D0,'Avg Discount % vs Front-line':FMT_P,'COGS $':FMT_D0,'Gross Profit $':FMT_D0,'Gross Margin %':FMT_P,'GP / Case':FMT_D2,'Margin vs Company (pts)':FMT_P}.items(): wbnd[f'{BC[h]}{rr}'].number_format=fm
for cidx in range(1,len(BH)+1): wbnd.cell(bN+1,cidx).font=f_bold; wbnd.cell(bN+1,cidx).fill=fill_tot
setw(wbnd,[34,10,11,9,10,13,9,13,12,11,13,13,10,9,10])
wbnd[f'A{bN+3}']='Reading this table: the front-line band shows what sells with no deal at all. Moving down the bands, discount % rises and margin % should fall gradually; a band with a sharply lower margin than its neighbours, or a large share of cases at the deepest band, is where deal structure deserves a look. Level bands are only as good as the tier match - see the ambiguous / not identified rows and the Read Me.'; wbnd[f'A{bN+3}'].font=f_sub; wbnd[f'A{bN+3}'].alignment=Alignment(wrap_text=True); wbnd.merge_cells(f'A{bN+3}:O{bN+5}')

# ================= SHEET: Excluded Lines =================
we=wb.create_sheet('Excluded Lines')
EH=['Category','Customer #','Customer','Product #','Product','# Invoice Lines','Cases','Units','Ext Price $ as invoiced (incl. deposit)','Deposit $','Cost Value $ (laid-in + tax)','Treatment in this workbook']
EC={h:L(i+1) for i,h in enumerate(EH)}
title(we,'Excluded Lines - everything in the invoice files that is NOT a product sale or credit','Aggregated by category x customer x product. These lines are kept out of Net Sales / COGS / GP; the memo table on the Executive Summary sums them from here.',len(EH))
header(we,4,EH); we.freeze_panes='B5'
e0=5; eN=e0+len(exg)-1
for i,r in enumerate(exg.itertuples(index=False)):
    rr=e0+i
    vals=[r.category,int(r.cust_num) if str(r.cust_num).isdigit() else r.cust_num,r.CustName,r.prod_num,r.ProdName,int(r.lines),r.cases,r.units,round(r.ext,2),round(r.dep,2),round(r.costv,2),r.treat]
    for j,v in enumerate(vals): we.cell(rr,j+1,v)
    for h,fm in {'# Invoice Lines':FMT_N,'Cases':FMT_N1,'Units':FMT_N1,'Ext Price $ as invoiced (incl. deposit)':FMT_D0,'Deposit $':FMT_D0,'Cost Value $ (laid-in + tax)':FMT_D0}.items(): we[f'{EC[h]}{rr}'].number_format=fm
we['A3']='Totals (follow filter)'; we['A3'].font=f_bold
for h in ['# Invoice Lines','Cases','Units','Ext Price $ as invoiced (incl. deposit)','Deposit $','Cost Value $ (laid-in + tax)']:
    c=EC[h]; we[f'{c}3']=f'=SUBTOTAL(109,{c}{e0}:{c}{eN})'; we[f'{c}3'].number_format=FMT_D0 if '$' in h else FMT_N; we[f'{c}3'].font=f_bold; we[f'{c}3'].fill=fill_tot
we.auto_filter.ref=f'A4:{L(len(EH))}{eN}'; setw(we,[34,10,30,9,40,8,9,9,14,10,12,80])
ER=lambda h: f"'Excluded Lines'!${EC[h]}${e0}:${EC[h]}${eN}"

# ================= SHEET: Executive Summary =================
wx=wb.create_sheet('Executive Summary',0)
title(wx,'Kohler Distributing - Margin & Deal Level Analysis, August 2026 (3-31 Aug)','Source: three Encompass Invoice Transaction Reports (8/3-8/7, 8/10-8/22, 8/24-8/31) + Pricing Analysis RDE by Month (deal levels). Every number on this page is a live formula over the data sheets. Aggregate margin = total gross profit / total net sales.',10)
wx['A4']='Headline results (product sales net of credits / returns; excludes deposits and all non-product activity)'; wx['A4'].font=f_sec
kp=[('Net Sales $',f"=SUM({SLR('Net Sales $')})",FMT_D0,'Unit Price x units on every product sale and credit line. Excludes keg / bottle deposits.'),
('Cost of Goods Sold $',f"=SUM({SLR('COGS $')})",FMT_D0,'(Laid-in Cost + Tax Cost - Participation) x units. Participation is supplier deal funding, so it reduces cost - the same convention Encompass uses for Laid-in in the pricing export.'),
('Gross Profit $','=D5-D6',FMT_D0,'Net Sales - COGS'),
('Gross Margin %','=IF(D5=0,"",D7/D5)',FMT_P,'Total GP / total net sales (not an average of line margins)'),
('Cases Sold (net of credits)',f"=SUM({SLR('Cases')})",FMT_N,'Encompass case-equivalents; spirits sold by the bottle count as fractions of a case'),
('Gross Profit per Case $','=IF(D9=0,"",D7/D9)',FMT_D2,''),
('Net Sales per Case $','=IF(D9=0,"",D5/D9)',FMT_D2,''),
('Discount $ Given vs Front-line',f"=SUM({SLR('Front-line Value $')})-D5",FMT_D0,'Front-line value (Encompass Full Price x units) minus net sales'),
('Avg Discount % vs Front-line',f"=IF(SUM({SLR('Front-line Value $')})=0,\"\",D12/SUM({SLR('Front-line Value $')}))",FMT_P,'Discount $ / front-line value'),
('Active customers',f"=COUNTA({CR('Customer #')})",FMT_N,''),('Products sold',f"=COUNTA({PR('Product #')})",FMT_N,''),('Suppliers',f"=COUNTA('Supplier Summary'!$A${s0}:$A${sN})",FMT_N,'')]
for i,(lab,fm,nf,note) in enumerate(kp):
    rr=5+i; wx.cell(rr,2,lab).font=f_bold; c=wx.cell(rr,4,fm); c.number_format=nf; c.font=f_bold; c.fill=fill_tot; c.border=box; wx.cell(rr,5,note).font=f_sub
wx['B22']='Integrity checks'; wx['B22'].font=f_sec
wx['B23']='Net sales: Sales Lines vs Deal Level Analysis vs Product Summary'; wx['D23']=f"=IF(AND(ABS(D5-'Deal Level Analysis'!{DL['Net Sales $']}3)<1,ABS(D5-'Product Summary'!{PL['Net Sales $']}3)<1,ABS(D5-'Customer Summary'!{CC['Net Sales $']}3)<1),\"OK - all sheets tie\",\"CHECK - sheets do not tie\")"
wx['B24']='Gross profit: Sales Lines vs Supplier Summary vs Brand Family Summary'; wx['D24']=f"=IF(AND(ABS(D7-'Supplier Summary'!{SC_['Gross Profit $']}3)<1,ABS(D7-'Brand Family Summary'!{FC_['Gross Profit $']}3)<1,ABS(D7-'Deal Band Summary'!{BC['Gross Profit $']}{bN+1})<1),\"OK - all sheets tie\",\"CHECK - sheets do not tie\")"
wx['B25']='Pricing export (Encompass) gross $ for the same month, for reference'; wx['D25']=f"=SUM({LR('Export Gross $')})"; wx['D25'].number_format=FMT_D0; wx['E25']='Encompass reports GP by deal level from the same invoices. Our GP differs slightly because the export omits products it does not carry and because some Laid-in costs in the export do not tie to FOB + Tax - Participation (see Read Me).'; wx['E25'].font=f_sub
wx['B26']='Pricing export cases'; wx['D26']=f"=SUM({LR('Export Cases')})"; wx['D26'].number_format=FMT_N
wx['B27']='Our GP vs export GP'; wx['D27']='=IF(D25=0,"",D7/D25-1)'; wx['D27'].number_format=FMT_P
for rr in range(23,28): wx.cell(rr,4).font=f_bold; wx.cell(rr,4).border=box

# reconciliation
wx['G4']='Reconciliation: invoice files to Net Sales (a negative amount below removes billings; a positive amount removes credits)'; wx['G4'].font=f_sec
rec=[('All invoice lines, Ext Price as invoiced (incl. deposits)',f"=SUM({SLR('Net Sales $')})+SUM({SLR('Deposits $ (excluded)')})+SUM({ER('Ext Price $ as invoiced (incl. deposit)')})",'Ties to the sum of Ext Price across the three CSVs'),
('less: keg / bottle deposits billed on product lines',f"=-SUM({SLR('Deposits $ (excluded)')})",'Deposit column x units'),
('less: empty keg / cooperage returns (deposit refunds)',f"=-SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Empty keg / cooperage return (deposit)\")",''),
('less: supplier billback invoices',f"=-SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Supplier billback invoice\")",'Customer = supplier'),
('less: finance / NSF / write-off lines',f"=-SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Finance / NSF / write-off\")",''),
('less: equipment / deposit items',f"=-SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Equipment / deposit item\")",''),
('less: FIFO / inventory / GL adjustments',f"=-SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"FIFO / inventory adjustment\")",'Includes the $53,159 GL line 998 00998'),
('remove: too-old-for-credit zero-outs / sell-back to supplier',f"=-SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Too-old-for-credit*\")",'Waterloo gin sold back to its supplier at below cost, plus $0 zero-out credits'),
('remove: product lines with no cost on file',f"=-SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Product line with no cost on file\")",'Priced lines Encompass carries no cost for; reviewed on Excluded Lines'),
('less: breakage / out-of-code / samples / zero-quantity lines ($0 invoiced)',f"=-SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Breakage*\")-SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Out-of-code*\")-SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Samples*\")-SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Zero-quantity*\")",'All billed at $0, so no $ effect - listed for completeness'),
('Net Sales = product sales net of credits / returns','=SUM(J5:J14)','Ties to headline Net Sales'),('check vs headline','=J15-D5','should be 0')]
for i,(lab,fm,note) in enumerate(rec):
    rr=5+i; wx.cell(rr,7,lab).font=f_bold if i>=10 else f_norm; c=wx.cell(rr,10,fm); c.number_format=FMT_D0; c.border=box; wx.cell(rr,11,note).font=f_sub
    if i==10: c.font=f_bold; c.fill=fill_tot
# memo
wx['G19']='Memo: returns, credits, breakage, out-of-code and other items - how they are treated'; wx['G19'].font=f_sec
memo=[('Credits / returns to customers (negative-quantity product lines)',f"=SUMIFS({SLR('Net Sales $')},{SLR('Line Type')},\"Credit / return\")",'INCLUDED - netted into Net Sales, COGS and cases (the same treatment as the Encompass pricing export). GP effect:',f"=SUMIFS({SLR('Net Sales $')},{SLR('Line Type')},\"Credit / return\")-SUMIFS({SLR('COGS $')},{SLR('Line Type')},\"Credit / return\")"),
('Breakage (customer "7 Breakage"), at laid-in cost + tax',f"=SUMIFS({ER('Cost Value $ (laid-in + tax)')},{ER('Category')},\"Breakage*\")",'EXCLUDED from headline GP - billed at $0, so it is an inventory write-off, not a sale. Cases:',f"=SUMIFS({ER('Cases')},{ER('Category')},\"Breakage*\")"),
('Out-of-code (customer "8 Out Of Code"), at laid-in cost + tax',f"=SUMIFS({ER('Cost Value $ (laid-in + tax)')},{ER('Category')},\"Out-of-code*\")",'EXCLUDED from headline GP - same reasoning. Cases:',f"=SUMIFS({ER('Cases')},{ER('Category')},\"Out-of-code*\")"),
('Samples taken (customers "6 Kohler Samples Taken 100%" / "120022 ... 50%"), at cost',f"=SUMIFS({ER('Cost Value $ (laid-in + tax)')},{ER('Category')},\"Samples*\")",'EXCLUDED from headline GP. Cases:',f"=SUMIFS({ER('Cases')},{ER('Category')},\"Samples*\")"),
('Sell-back of too-old stock to supplier (Waterloo gin), revenue received',f"=SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Too-old-for-credit*\")",'EXCLUDED from sales. Cost value of the same lines:',f"=SUMIFS({ER('Cost Value $ (laid-in + tax)')},{ER('Category')},\"Too-old-for-credit*\")"),
('Gross profit AFTER charging breakage, out-of-code and samples at cost','=D7-J21-J22-J23','Alternative view: headline GP less the three write-off lines above. Margin %:','=IF(D5=0,"",J25/D5)'),
('Deposits billed on product lines (excluded from net sales)',f"=SUM({SLR('Deposits $ (excluded)')})",'Deposit column x units; keg shells and returnable bottles',''),
('Zero-quantity invoice lines (short-shipped / cancelled items, $0)',f"=SUMIFS({ER('# Invoice Lines')},{ER('Category')},\"Zero-quantity*\")",'Count of lines. No $ effect; useful as an out-of-stock signal',''),
('Supplier billback invoices (customer = supplier)',f"=SUMIFS({ER('Ext Price $ as invoiced (incl. deposit)')},{ER('Category')},\"Supplier billback invoice\")",'EXCLUDED from sales. Supplier deal funding is captured per line through the Participation column, which reduces COGS.','')]
for i,(lab,fm,note,fm2) in enumerate(memo):
    rr=20+i
    wx.cell(rr,7,lab).font=f_norm; c=wx.cell(rr,10,fm); c.number_format=FMT_N if 'Zero-quantity' in lab else FMT_D0; c.border=box; wx.cell(rr,11,note).font=f_sub
    if fm2:
        c2=wx.cell(rr,14,fm2); c2.number_format=FMT_P if 'Margin' in note else (FMT_N if 'Cases:' in note else FMT_D0); c2.border=box
wx.cell(25,7).font=f_bold; wx.cell(25,10).font=f_bold; wx.cell(25,10).fill=fill_tot
# top tables
wx['B29']='Top 10 suppliers by gross profit'; wx['B29'].font=f_sec
header(wx,30,['Supplier','Net Sales $','Gross Profit $','Gross Margin %','GP / Case','Share of GP'],start=2)
gp_sup=(sales.assign(gp=sales['net_sales']-sales['cogs']).groupby('Supplier')['gp'].sum().sort_values(ascending=False))
for i,s in enumerate(gp_sup.index[:10]):
    rr=31+i; wx.cell(rr,2,s)
    for j,h in enumerate(['Net Sales $','Gross Profit $','Gross Margin %','GP / Case','Share of Company GP']):
        c=wx.cell(rr,3+j,f"=IFERROR(INDEX('Supplier Summary'!${SC_[h]}${s0}:${SC_[h]}${sN},MATCH($B{rr},'Supplier Summary'!$A${s0}:$A${sN},0)),\"\")"); c.number_format=[FMT_D0,FMT_D0,FMT_P,FMT_D2,FMT_P][j]; c.font=f_link
wx['B42']='Top 10 products by gross profit'; wx['B42'].font=f_sec
header(wx,43,['Product #','Product','Net Sales $','Gross Profit $','Gross Margin %','GP / Case','Avg Discount %'],start=2)
for i,r in enumerate(prods.sort_values('gp',ascending=False).head(10).itertuples(index=False)):
    rr=44+i; wx.cell(rr,2,r.prod_num); wx.cell(rr,3,f"=IFERROR(INDEX({PR('Product')},MATCH($B{rr},{PR('Product #')},0)),\"\")").font=f_link
    for j,h in enumerate(['Net Sales $','Gross Profit $','Gross Margin %','GP / Case','Avg Discount % vs Front-line (invoice)']):
        c=wx.cell(rr,4+j,f"=IFERROR(INDEX({PR(h)},MATCH($B{rr},{PR('Product #')},0)),\"\")"); c.number_format=[FMT_D0,FMT_D0,FMT_P,FMT_D2,FMT_P][j]; c.font=f_link
wx['B55']='Bottom 10 products by gross profit (net sales above the review minimum)'; wx['B55'].font=f_sec
header(wx,56,['Product #','Product','Net Sales $','Gross Profit $','Gross Margin %','GP / Case','Avg Discount %'],start=2)
for i,r in enumerate(prods[prods['ns']>=5000].sort_values('gp').head(10).itertuples(index=False)):
    rr=57+i; wx.cell(rr,2,r.prod_num); wx.cell(rr,3,f"=IFERROR(INDEX({PR('Product')},MATCH($B{rr},{PR('Product #')},0)),\"\")").font=f_link
    for j,h in enumerate(['Net Sales $','Gross Profit $','Gross Margin %','GP / Case','Avg Discount % vs Front-line (invoice)']):
        c=wx.cell(rr,4+j,f"=IFERROR(INDEX({PR(h)},MATCH($B{rr},{PR('Product #')},0)),\"\")"); c.number_format=[FMT_D0,FMT_D0,FMT_P,FMT_D2,FMT_P][j]; c.font=f_link
wx['J29']='Margin distribution - products (by net sales)'; wx['J29'].font=f_sec
header(wx,30,['Gross margin band','# Products','Net Sales $','Gross Profit $'],start=10)
mb=[('Negative',None,0),('0% - 15%',0,0.15),('15% - 20%',0.15,0.20),('20% - 25%',0.20,0.25),('25% - 30%',0.25,0.30),('30% - 35%',0.30,0.35),('35% +',0.35,None)]
for i,(lab,lo,hi) in enumerate(mb):
    rr=31+i; wx.cell(rr,10,lab)
    crit = (f'{PR("Gross Margin %")},"<0"' if lo is None else (f'{PR("Gross Margin %")},">={lo}"' + (f',{PR("Gross Margin %")},"<{hi}"' if hi is not None else '')))
    wx.cell(rr,11,f'=COUNTIFS({crit})').number_format=FMT_N
    wx.cell(rr,12,f'=SUMIFS({PR("Net Sales $")},{crit})').number_format=FMT_D0
    wx.cell(rr,13,f'=SUMIFS({PR("Gross Profit $")},{crit})').number_format=FMT_D0
wx.cell(38,10,'No net sales (credits offset sales)'); wx.cell(38,11,f'=COUNTA({PR("Product #")})-SUM(K31:K37)').number_format=FMT_N
wx.cell(38,12,f'=SUMIFS({PR("Net Sales $")},{PR("Gross Margin %")},"")').number_format=FMT_D0; wx.cell(38,13,f'=SUMIFS({PR("Gross Profit $")},{PR("Gross Margin %")},"")').number_format=FMT_D0
wx.cell(39,10,'Total').font=f_bold
for j in (11,12,13): c=wx.cell(39,j,f'=SUM({L(j)}31:{L(j)}38)'); c.font=f_bold; c.fill=fill_tot; c.number_format=FMT_N if j==11 else FMT_D0
wx['J42']='Deal tier mix (from Deal Band Summary)'; wx['J42'].font=f_sec
header(wx,43,['Level band','% of Cases','Net Sales $','Gross Margin %','Avg Discount %'],start=10)
for i,b in enumerate(bands):
    rr=44+i; wx.cell(rr,10,b)
    for j,h in enumerate(['% of Cases','Net Sales $','Gross Margin %','Avg Discount % vs Front-line']):
        c=wx.cell(rr,11+j,f"=IFERROR(INDEX('Deal Band Summary'!${BC[h]}${b0}:${BC[h]}${bN},MATCH($J{rr},'Deal Band Summary'!$A${b0}:$A${bN},0)),\"\")"); c.number_format=[FMT_P,FMT_D0,FMT_P,FMT_P][j]; c.font=f_link
setw(wx,[2,44,14,16,60,2,58,2,2,16,50,2,14,14])
wx.column_dimensions['E'].width=60; wx.column_dimensions['K'].width=14; wx.column_dimensions['L'].width=14; wx.column_dimensions['M'].width=14; wx.column_dimensions['N'].width=14
wx.column_dimensions['C'].width=42; wx.column_dimensions['D'].width=16
wx.freeze_panes='A4'

# ================= Opportunities lists =================
sl=sales.assign(gp=sales['net_sales']-sales['cogs'])
flagrows=[('Products flagged NEGATIVE margin',f'=COUNTIFS({PR("Flags")},"*NEGATIVE*")'),('Products flagged low margin',f'=COUNTIFS({PR("Flags")},"*Low margin*")'),('Products with most volume at their deepest price',f'=COUNTIFS({PR("Flags")},"*deepest price*")'),('Products with prices not on the deal sheet',f'=COUNTIFS({PR("Flags")},"*not on deal sheet*")'),
('Deal-level rows flagged NEGATIVE margin',f'=COUNTIFS({DR("Flags")},"*NEGATIVE*")'),('Deal-level rows flagged deep discount',f'=COUNTIFS({DR("Flags")},"*Deep discount*")'),('Deal-level rows below the deepest published tier',f'=COUNTIFS({DR("Flags")},"*Below deepest*")'),('Deal-level rows with tier ambiguous',f'=COUNTIFS({DR("Flags")},"*ambiguous*")'),('Deal-level rows not on the deal sheet / outside window',f'=COUNTIFS({DR("Flags")},"*not on deal sheet*")+COUNTIFS({DR("Flags")},"*Outside deal window*")'),
('Customers flagged NEGATIVE margin',f'=COUNTIFS({CR("Flags")},"*NEGATIVE*")'),('Customers flagged low margin (above minimum sales)',f'=COUNTIFS({CR("Flags")},"*Low margin*")'),('Customers flagged deep avg discount (above minimum sales)',f'=COUNTIFS({CR("Flags")},"*Deep avg*")')]
for i,(lab,fm) in enumerate(flagrows):
    rr=11+i; wo.cell(rr,1,lab); c=wo.cell(rr,4,fm); c.number_format=FMT_N; c.font=f_bold
row=25
def olist(ttl,cols,rows,fmtl,note=None):
    global row
    wo.cell(row,1,ttl).font=f_sec; row+=1
    if note: wo.cell(row,1,note).font=f_sub; row+=1
    header(wo,row,cols); row+=1
    for r in rows:
        for j,v in enumerate(r):
            c=wo.cell(row,j+1,v)
            if fmtl[j]: c.number_format=fmtl[j]
        row+=1
    row+=1
def gp_row(g):
    return g
# 1 negative-margin customer x product lines
neg=sl.groupby(['cust_num','CustName','prod_num','ProdName'],dropna=False).agg(cases=('cases','sum'),ns=('net_sales','sum'),cogs=('cogs','sum'),gp=('gp','sum')).reset_index()
neg=neg[(neg['gp']<0)&(neg['ns']>0)].sort_values('gp').head(30)
olist('1. Negative-margin sales (customer x product, sold below laid-in cost) - top 30 by GP lost',['Customer #','Customer','Product #','Product','Cases','Net Sales $','COGS $','Gross Profit $','Gross Margin %'],
      [[int(r.cust_num),r.CustName,r.prod_num,r.ProdName,r.cases,round(r.ns,2),round(r.cogs,2),f'=F{{r}}-G{{r}}','=IF(F{r}=0,"",H{r}/F{r})'] for r in neg.itertuples(index=False)],[None,None,None,None,FMT_N1,FMT_D0,FMT_D0,FMT_D0,FMT_P],'Filter Sales Lines on Gross Profit < 0 for the full list. Check whether the cost on file is right before acting on price.')
# fix formulas rows: replace placeholders
for rr in range(1,row+1):
    for cidx in (8,9):
        v=wo.cell(rr,cidx).value
        if isinstance(v,str) and '{r}' in v: wo.cell(rr,cidx).value=v.replace('{r}',str(rr))
# 2 low-margin products
lp=prods.copy(); lp['margin']=np.where(lp['ns']!=0,lp['gp']/lp['ns'],np.nan)
lp=lp[(lp['ns']>=5000)&(lp['margin']<0.20)].sort_values('margin').head(30)
start=row
olist('2. Low-margin products (net sales >= $5,000 and margin below 20% at build time) - lowest margin first',['Product #','Product','Supplier','Brand Family','Cases','Net Sales $','Gross Profit $','Gross Margin %','Avg Discount % (live)'],
      [[r.prod_num,r.ProdName,r.Supplier,r.Family,r.cases,round(r.ns,2),round(r.gp,2),None,None] for r in lp.itertuples(index=False)],[None,None,None,None,FMT_N1,FMT_D0,FMT_D0,FMT_P,FMT_P],'Live equivalent: Product Summary, filter Flags on "Low margin". Margin and discount here look up Product Summary.')
for rr in range(start+3,start+3+len(lp)):
    wo.cell(rr,8,f"=IFERROR(INDEX({PR('Gross Margin %')},MATCH($A{rr},{PR('Product #')},0)),\"\")").font=f_link
    wo.cell(rr,9,f"=IFERROR(INDEX({PR('Avg Discount % vs Front-line (invoice)')},MATCH($A{rr},{PR('Product #')},0)),\"\")").font=f_link
# 3 deepest discounts by $ given
dd=dla.assign(disc=dla['front']-dla['net'],discpct=np.where(dla['front']!=0,(dla['front']-dla['net'])/dla['front'],0),gp=dla['net']-dla['cogs'])
dd=dd[(dd['net']>=5000)&(dd['discpct']>0.12)].sort_values('disc',ascending=False).head(30)
olist('3. Deepest discounts vs front-line (product x deal level, net sales >= $5,000 and discount > 12%) - top 30 by discount $ given',['Product #','Product','Deal Level','Net Price / Case','Front-line / Case','Discount %','Cases','Net Sales $','Discount $ Given','Gross Profit $','Gross Margin %'],
      [[r.prod_num,r.ProdName,r.level_label,round(r.case_price,2),round(r.front_case,2),round(r.discpct,4),r.cases,round(r.net,2),round(r.disc,2),round(r.gp,2),(r.gp/r.net if r.net else None)] for r in dd.itertuples(index=False)],[None,None,None,FMT_D2,FMT_D2,FMT_P,FMT_N1,FMT_D0,FMT_D0,FMT_D0,FMT_P],'Live equivalent: Deal Level Analysis, filter Flags on "Deep discount". Deep tiers are normal for volume accounts; the question is whether the margin at the tier is still acceptable.')
# 4 customers lowest margin
cm=sl.groupby(['cust_num','CustName','Rep','Prem'],dropna=False).agg(ns=('net_sales','sum'),gp=('gp','sum'),cases=('cases','sum')).reset_index(); cm['margin']=cm['gp']/cm['ns'].where(cm['ns']!=0)
cm=cm[cm['ns']>=5000].sort_values('margin').head(30)
olist('4. Lowest-margin accounts (net sales >= $5,000) - lowest margin first',['Customer #','Customer','Sales Rep','Premise','Cases','Net Sales $','Gross Profit $','Gross Margin %','Company margin (live)'],
      [[int(r.cust_num),r.CustName,r.Rep,r.Prem,r.cases,round(r.ns,2),round(r.gp,2),(r.gp/r.ns if r.ns else None),"='Executive Summary'!$D$8"] for r in cm.itertuples(index=False)],[None,None,None,None,FMT_N1,FMT_D0,FMT_D0,FMT_P,FMT_P],'Live equivalent: Customer Summary, filter Flags on "Low margin". Account margin is driven by product mix and by deal tier; compare with the rep column for coaching.')
# 5 not on deal sheet
nd=dla[dla['match_status'].isin(['Not on deal sheet','Outside window'])].sort_values('net',ascending=False)
olist('5. Prices not on the published deal sheet (pricing exceptions to verify in Encompass)',['Product #','Product','Supplier','Match','Note','Net Price / Case','Front-line / Case','Cases','Net Sales $','# Customers'],
      [[r.prod_num,r.ProdName,r.Supplier,r.match_status,sales.loc[(sales['prod_num']==r.prod_num)&(sales['case_price'].round(2)==round(r.case_price,2)),'match_note'].iloc[0],round(r.case_price,2),round(r.front_case,2),r.cases,round(r.net,2),int(r.ncust)] for r in nd.itertuples(index=False)],[None,None,None,None,None,FMT_D2,FMT_D2,FMT_N1,FMT_D0,FMT_N],'Every product x price that matched no published deal level for the invoice date. Most are products the pricing export does not carry (e.g. 2 Canos, Waterloo) - pull them into the export or confirm the manual price.')
# 6 heavy deepest-tier
pdeep=[]
for pn,g in dla.groupby('prod_num'):
    tot=g['cases'].sum()
    if tot<100 or len(g)<3: continue
    gg=g[g['cases']>0]
    if gg.empty: continue
    lo=gg.loc[gg['case_price'].idxmin()]
    sh=lo['cases']/tot
    if sh>0.6: pdeep.append((pn,lo['ProdName'],lo['Supplier'],lo['level_label'],lo['case_price'],lo['front_case'],tot,sh,g['net'].sum(),(g['net']-g['cogs']).sum()))
pdeep=sorted(pdeep,key=lambda x:-x[8])[:30]
olist('6. Products where most volume moves at the deepest price (>60% of cases, >=100 cases, 3+ price points) - top 30 by net sales',['Product #','Product','Supplier','Deepest level sold','Deepest Price / Case','Front-line / Case','Total Cases','Share at Deepest','Net Sales $','Gross Profit $'],
      [list(x) for x in pdeep],[None,None,None,None,FMT_D2,FMT_D2,FMT_N1,FMT_P,FMT_D0,FMT_D0],'If nearly all volume already earns the deepest tier, the ladder above it is not doing work - candidates for restructuring tiers or trimming the deepest price. Live equivalent: Product Summary, filter Flags on "deepest price".')
# 7 credits
cr=sl[sl['ctype']=='Credit / return'].groupby(['cust_num','CustName','prod_num','ProdName'],dropna=False).agg(cases=('cases','sum'),ns=('net_sales','sum'),gp=('gp','sum')).reset_index().sort_values('ns').head(20)
olist('7. Largest credits / returns (customer x product) - already netted into the headline numbers',['Customer #','Customer','Product #','Product','Cases credited','Credit $','GP effect $'],
      [[int(r.cust_num),r.CustName,r.prod_num,r.ProdName,r.cases,round(r.ns,2),round(r.gp,2)] for r in cr.itertuples(index=False)],[None,None,None,None,FMT_N1,FMT_D0,FMT_D0],'The invoice export does not say WHY a credit was issued (return, pricing correction, breakage at the account); a credit-reason report would.')
setw(wo,[46,36,24,22,14,12,12,12,12,12,12])
wo.column_dimensions['D'].width=16

# ================= SHEET: Scenario - Products =================
wsp=wb.create_sheet('Scenario - Products')
title(wsp,'Pricing Scenario by Product - change price, see gross profit and margin at constant August volume','Blue cells are inputs. Type a product # (any product from Product Summary) and a price change as a % and/or $ per case. Volume, cost and mix are held constant. Rows are pre-loaded with the top 40 products by net sales; the last 15 rows are blank for your own picks.',16)
wsp['A4']='Global levers (apply to every row unless the row has its own input)'; wsp['A4'].font=f_sec
wsp['A5']='Price change % (all rows)'; wsp['D5']=0.0; wsp['D5'].font=f_input; wsp['D5'].fill=fill_in; wsp['D5'].number_format=FMT_P
wsp['A6']='Price change $ / case (all rows)'; wsp['D6']=0.0; wsp['D6'].font=f_input; wsp['D6'].fill=fill_in; wsp['D6'].number_format=FMT_D2
wsp['F5']='Example: -0.50 in D6 models cutting every listed product by 50 cents a case; 2% in D5 models a 2% list increase. A row-level input overrides the global lever for that row.'; wsp['F5'].font=f_sub
SPH=['Product # (input)','Product','Supplier','Cases (Aug)','Current Avg Net Price / Case','Cost / Case','Current Net Sales $','Current GP $','Current Margin %','Row Price Change % (input)','Row Price Change $ / Case (input)','New Net Price / Case','New Net Sales $','COGS $ (constant)','New GP $','New Margin %','Change in GP $','Change in Net Sales $','Margin change (pts)']
SPC={h:L(i+1) for i,h in enumerate(SPH)}
header(wsp,8,SPH); wsp.freeze_panes='C9'
top=prods.head(40)['prod_num'].tolist()+['']*15
sp0=9; spN=sp0+len(top)-1
for i,pn in enumerate(top):
    rr=sp0+i; P=lambda h: f'{SPC[h]}{rr}'
    c=wsp[P('Product # (input)')]; c.value=pn if pn else None; c.font=f_input; c.fill=fill_in
    LK=lambda h: f'IFERROR(INDEX({PR(h)},MATCH({P("Product # (input)")},{PR("Product #")},0)),"")'
    wsp[P('Product')]=f'=IF({P("Product # (input)")}="","",{LK("Product")})'; wsp[P('Supplier')]=f'=IF({P("Product # (input)")}="","",{LK("Supplier")})'
    wsp[P('Cases (Aug)')]=f'=IF({P("Product # (input)")}="","",{LK("Cases")})'
    wsp[P('Current Avg Net Price / Case')]=f'=IF({P("Product # (input)")}="","",{LK("Avg Net Price / Case")})'
    wsp[P('Cost / Case')]=f'=IF({P("Product # (input)")}="","",{LK("Cost / Case")})'
    wsp[P('Current Net Sales $')]=f'=IF({P("Product # (input)")}="","",{LK("Net Sales $")})'
    wsp[P('Current GP $')]=f'=IF({P("Product # (input)")}="","",{LK("Gross Profit $")})'
    wsp[P('Current Margin %')]=f'=IF(OR({P("Current Net Sales $")}="",{P("Current Net Sales $")}=0),"",{P("Current GP $")}/{P("Current Net Sales $")})'
    for h in ['Row Price Change % (input)','Row Price Change $ / Case (input)']:
        c=wsp[P(h)]; c.font=f_input; c.fill=fill_in; c.number_format=FMT_P if '%' in h else FMT_D2
    wsp[P('New Net Price / Case')]=f'=IF({P("Current Avg Net Price / Case")}="","",{P("Current Avg Net Price / Case")}*(1+IF({P("Row Price Change % (input)")}<>"",{P("Row Price Change % (input)")},$D$5))+IF({P("Row Price Change $ / Case (input)")}<>"",{P("Row Price Change $ / Case (input)")},$D$6))'
    wsp[P('New Net Sales $')]=f'=IF({P("New Net Price / Case")}="","",{P("New Net Price / Case")}*{P("Cases (Aug)")})'
    wsp[P('COGS $ (constant)')]=f'=IF({P("Product # (input)")}="","",{P("Current Net Sales $")}-{P("Current GP $")})'
    wsp[P('New GP $')]=f'=IF({P("New Net Sales $")}="","",{P("New Net Sales $")}-{P("COGS $ (constant)")})'
    wsp[P('New Margin %')]=f'=IF(OR({P("New Net Sales $")}="",{P("New Net Sales $")}=0),"",{P("New GP $")}/{P("New Net Sales $")})'
    wsp[P('Change in GP $')]=f'=IF({P("New GP $")}="","",{P("New GP $")}-{P("Current GP $")})'
    wsp[P('Change in Net Sales $')]=f'=IF({P("New Net Sales $")}="","",{P("New Net Sales $")}-{P("Current Net Sales $")})'
    wsp[P('Margin change (pts)')]=f'=IF(OR({P("New Margin %")}="",{P("Current Margin %")}=""),"",{P("New Margin %")}-{P("Current Margin %")})'
    for h,fm in {'Cases (Aug)':FMT_N1,'Current Avg Net Price / Case':FMT_D2,'Cost / Case':FMT_D2,'Current Net Sales $':FMT_D0,'Current GP $':FMT_D0,'Current Margin %':FMT_P,'New Net Price / Case':FMT_D2,'New Net Sales $':FMT_D0,'COGS $ (constant)':FMT_D0,'New GP $':FMT_D0,'New Margin %':FMT_P,'Change in GP $':FMT_D0,'Change in Net Sales $':FMT_D0,'Margin change (pts)':FMT_P}.items(): wsp[f'{SPC[h]}{rr}'].number_format=fm
    for h in ['Product','Supplier','Cases (Aug)','Current Avg Net Price / Case','Cost / Case','Current Net Sales $','Current GP $']: wsp[f'{SPC[h]}{rr}'].font=f_link
rr=spN+1; P=lambda h: f'{SPC[h]}{rr}'
wsp[P('Product # (input)')]='Totals (listed rows)'; wsp[P('Product # (input)')].font=f_bold
for h in ['Cases (Aug)','Current Net Sales $','Current GP $','New Net Sales $','COGS $ (constant)','New GP $','Change in GP $','Change in Net Sales $']:
    wsp[P(h)]=f'=SUM({SPC[h]}{sp0}:{SPC[h]}{spN})'; wsp[P(h)].number_format=FMT_D0 if '$' in h else FMT_N1; wsp[P(h)].font=f_bold; wsp[P(h)].fill=fill_tot
wsp[P('Current Margin %')]=f'=IF({P("Current Net Sales $")}=0,"",{P("Current GP $")}/{P("Current Net Sales $")})'; wsp[P('Current Margin %')].number_format=FMT_P; wsp[P('Current Margin %')].font=f_bold; wsp[P('Current Margin %')].fill=fill_tot
wsp[P('New Margin %')]=f'=IF({P("New Net Sales $")}=0,"",{P("New GP $")}/{P("New Net Sales $")})'; wsp[P('New Margin %')].number_format=FMT_P; wsp[P('New Margin %')].font=f_bold; wsp[P('New Margin %')].fill=fill_tot
wsp[P('Margin change (pts)')]=f'=IF(OR({P("New Margin %")}="",{P("Current Margin %")}=""),"",{P("New Margin %")}-{P("Current Margin %")})'; wsp[P('Margin change (pts)')].number_format=FMT_P; wsp[P('Margin change (pts)')].font=f_bold; wsp[P('Margin change (pts)')].fill=fill_tot
rr=spN+3
wsp[f'A{rr}']='Company roll-up at constant volume'; wsp[f'A{rr}'].font=f_sec
roll=[('Company net sales - August actual',"='Executive Summary'!$D$5",FMT_D0),('Company gross profit - August actual',"='Executive Summary'!$D$7",FMT_D0),('Company gross margin - August actual',"='Executive Summary'!$D$8",FMT_P),
      ('Change in net sales from this scenario',f'={SPC["Change in Net Sales $"]}{spN+1}',FMT_D0),('Change in gross profit from this scenario',f'={SPC["Change in GP $"]}{spN+1}',FMT_D0),
      ('Company net sales - scenario',f'=D{rr+1}+D{rr+4}',FMT_D0),('Company gross profit - scenario',f'=D{rr+2}+D{rr+5}',FMT_D0),('Company gross margin - scenario',f'=IF(D{rr+6}=0,"",D{rr+7}/D{rr+6})',FMT_P),('Margin change (pts)',f'=IF(D{rr+8}="","",D{rr+8}-D{rr+3})',FMT_P)]
for i,(lab,fm,nf) in enumerate(roll):
    wsp.cell(rr+1+i,1,lab); c=wsp.cell(rr+1+i,4,fm); c.number_format=nf; c.font=f_bold; c.border=box
    if i>=5: c.fill=fill_tot
setw(wsp,[18,40,24,10,12,10,13,12,10,12,12,12,13,13,12,10,12,13,10])
wsp['B5'].value=None

# ================= SHEET: Scenario - Deal Levels =================
wsd=wb.create_sheet('Scenario - Deal Levels')
title(wsd,'Pricing Scenario by Deal Level - reprice individual tiers at constant August volume','Pre-loaded with every deal level sold for the top 25 products by net sales (from Deal Level Analysis). Edit the blue "New Price / Case" cells, or use the global levers to move every deal tier at once; front-line rows are not moved by the levers.',18)
wsd['A4']='Global levers'; wsd['A4'].font=f_sec
wsd['A5']='Change all DEAL-tier prices by $ / case (front-line rows untouched)'; wsd['E5']=0.0; wsd['E5'].font=f_input; wsd['E5'].fill=fill_in; wsd['E5'].number_format=FMT_D2
wsd['A6']='Change all DEAL-tier prices by %'; wsd['E6']=0.0; wsd['E6'].font=f_input; wsd['E6'].fill=fill_in; wsd['E6'].number_format=FMT_P
wsd['A7']='Cap: do not let any new price exceed the row front-line price?'; wsd['E7']='Yes'; wsd['E7'].font=f_input; wsd['E7'].fill=fill_in; wsd['G7']='Yes / No'; wsd['G7'].font=f_sub
SDH=['Product #','Product','Supplier','Deal Level','Level Band','Cases (Aug)','Front-line / Case','Current Net Price / Case','Current Discount %','Cost / Case','Current Net Sales $','Current GP $','Current Margin %','New Price / Case (input, blank = current)','Effective New Price / Case','New Net Sales $','New GP $','New Margin %','Change in GP $','New Discount %']
SDC={h:L(i+1) for i,h in enumerate(SDH)}
header(wsd,9,SDH); wsd.freeze_panes='D10'
top25=prods.head(25)['prod_num'].tolist()
rows_sd=dla[dla['prod_num'].isin(top25)&(dla['cases']>0)].copy()
rows_sd['ord']=rows_sd['prod_num'].map({p:i for i,p in enumerate(top25)}); rows_sd=rows_sd.sort_values(['ord','lvsort','case_price'],ascending=[True,True,False])
sd0=10; sdN=sd0+len(rows_sd)-1
for i,r in enumerate(rows_sd.itertuples(index=False)):
    rr=sd0+i; P=lambda h: f'{SDC[h]}{rr}'
    wsd[P('Product #')]=r.prod_num; wsd[P('Product')]=r.ProdName; wsd[P('Supplier')]=r.Supplier; wsd[P('Deal Level')]=r.level_label; wsd[P('Level Band')]=r.band
    wsd[P('Cases (Aug)')]=r.cases; wsd[P('Front-line / Case')]=round(r.front_case,4); wsd[P('Current Net Price / Case')]=round(r.case_price,4)
    wsd[P('Current Discount %')]=f'=IF({P("Front-line / Case")}=0,0,1-{P("Current Net Price / Case")}/{P("Front-line / Case")})'
    wsd[P('Cost / Case')]=round(r.cogs/r.cases,4)
    wsd[P('Current Net Sales $')]=f'={P("Current Net Price / Case")}*{P("Cases (Aug)")}'
    wsd[P('Current GP $')]=f'={P("Current Net Sales $")}-{P("Cost / Case")}*{P("Cases (Aug)")}'
    wsd[P('Current Margin %')]=f'=IF({P("Current Net Sales $")}=0,"",{P("Current GP $")}/{P("Current Net Sales $")})'
    c=wsd[P('New Price / Case (input, blank = current)')]; c.font=f_input; c.fill=fill_in; c.number_format=FMT_D2
    isdeal=f'{P("Level Band")}<>"0 (front-line)"'
    raw=f'IF({P("New Price / Case (input, blank = current)")}<>"",{P("New Price / Case (input, blank = current)")},{P("Current Net Price / Case")}*(1+IF({isdeal},$E$6,0))+IF({isdeal},$E$5,0))'
    wsd[P('Effective New Price / Case')]=f'=IF(AND($E$7="Yes",{P("Front-line / Case")}>0),MIN({raw},{P("Front-line / Case")}),{raw})'
    wsd[P('New Net Sales $')]=f'={P("Effective New Price / Case")}*{P("Cases (Aug)")}'
    wsd[P('New GP $')]=f'={P("New Net Sales $")}-{P("Cost / Case")}*{P("Cases (Aug)")}'
    wsd[P('New Margin %')]=f'=IF({P("New Net Sales $")}=0,"",{P("New GP $")}/{P("New Net Sales $")})'
    wsd[P('Change in GP $')]=f'={P("New GP $")}-{P("Current GP $")}'
    wsd[P('New Discount %')]=f'=IF({P("Front-line / Case")}=0,0,1-{P("Effective New Price / Case")}/{P("Front-line / Case")})'
    for h,fm in {'Cases (Aug)':FMT_N1,'Front-line / Case':FMT_D2,'Current Net Price / Case':FMT_D2,'Current Discount %':FMT_P,'Cost / Case':FMT_D2,'Current Net Sales $':FMT_D0,'Current GP $':FMT_D0,'Current Margin %':FMT_P,'Effective New Price / Case':FMT_D2,'New Net Sales $':FMT_D0,'New GP $':FMT_D0,'New Margin %':FMT_P,'Change in GP $':FMT_D0,'New Discount %':FMT_P}.items(): wsd[f'{SDC[h]}{rr}'].number_format=fm
rr=sdN+1; P=lambda h: f'{SDC[h]}{rr}'
wsd[P('Product #')]='Totals'; wsd[P('Product #')].font=f_bold
for h in ['Cases (Aug)','Current Net Sales $','Current GP $','New Net Sales $','New GP $','Change in GP $']:
    wsd[P(h)]=f'=SUM({SDC[h]}{sd0}:{SDC[h]}{sdN})'; wsd[P(h)].number_format=FMT_D0 if '$' in h else FMT_N1; wsd[P(h)].font=f_bold; wsd[P(h)].fill=fill_tot
for h,num,den in [('Current Margin %','Current GP $','Current Net Sales $'),('New Margin %','New GP $','New Net Sales $')]:
    wsd[P(h)]=f'=IF({P(den)}=0,"",{P(num)}/{P(den)})'; wsd[P(h)].number_format=FMT_P; wsd[P(h)].font=f_bold; wsd[P(h)].fill=fill_tot
rr=sdN+3; wsd[f'A{rr}']='Company roll-up at constant volume'; wsd[f'A{rr}'].font=f_sec
roll=[('Company gross profit - August actual',"='Executive Summary'!$D$7",FMT_D0),('Company net sales - August actual',"='Executive Summary'!$D$5",FMT_D0),('Change in gross profit from this scenario',f'={SDC["Change in GP $"]}{sdN+1}',FMT_D0),('Change in net sales from this scenario',f'={SDC["New Net Sales $"]}{sdN+1}-{SDC["Current Net Sales $"]}{sdN+1}',FMT_D0),('Company gross profit - scenario',f'=E{rr+1}+E{rr+3}',FMT_D0),('Company gross margin - scenario',f'=IF(E{rr+2}+E{rr+4}=0,"",E{rr+5}/(E{rr+2}+E{rr+4}))',FMT_P),('Company gross margin - August actual',"='Executive Summary'!$D$8",FMT_P)]
for i,(lab,fm,nf) in enumerate(roll):
    wsd.cell(rr+1+i,1,lab); c=wsd.cell(rr+1+i,5,fm); c.number_format=nf; c.font=f_bold; c.border=box
wsd.auto_filter.ref=f'A9:{L(len(SDH))}{sdN}'
setw(wsd,[10,40,22,18,16,10,10,11,10,10,13,12,10,14,12,13,12,10,12,10])

# ================= SHEET: Read Me =================
wr=wb.create_sheet('Read Me',0)
title(wr,'Read Me - Kohler Distributing margin & deal level analysis, August 2026',None,3)
wr.column_dimensions['A'].width=150
txt=[
('SOURCE FILES','h'),
('1) InvoiceTransReport_GSHARKEY_20260915_0858330252383.csv - Encompass Invoice Transaction Report, load-sheet dates 8/3/2026 - 8/7/2026 (37,032 lines).',''),
('2) InvoiceTransReport_GSHARKEY_20260915_0859429305273.csv - same report, 8/10/2026 - 8/22/2026 (66,245 lines).',''),
('3) InvoiceTransReport_GSHARKEY_20260915_0900304620699.csv - same report, 8/24/2026 - 8/31/2026 (38,441 lines).',''),
('   Together: 141,718 invoice lines, no duplicate Invoice Trans IDs, no lines dated outside August. Columns used: Customer, Product, Cases, Num Units, FOB, Tax Cost, Laid-in Cost, Full Price, Discount, Participation, Deposit, Unit Price, Ext Price, Promotion Name.',''),
('4) Pricing_Analysis_RDE_by_Month_1.csv - Encompass "Pricing Analysis RDE by Month": one row per product x deal level (Min Purchase Qty, in cases) x deal window with the cases sold at that level, FOB / Tax / Participation / Laid-in cost, Gross $ and Margin %. 5,603 rows, 1,680 products, 102 suppliers, windows 8/3 - 8/31/2026. Reproduced on "Deal Ladder (Export)".',''),
('5) Pricing_Deal_Levels_Aug_2026.xlsx - the earlier workbook built from file 4. Used here only for its Supplier / Brand / Package split per product (copied to "Brand Family Map"). Its own summaries are not repeated.',''),
('6) hub/data/accounts.js (repo, as of 2026-09-10) - rep / area / on-off premise per customer number, used only to label the Customer Summary. Not a source of sales or cost.',''),
('',''),
('HOW THE NUMBERS ARE BUILT','h'),
('Net Sales = Unit Price x Num Units on every product sale and credit line. Ext Price in the file = (Unit Price + Deposit) x Num Units on 100% of lines, so deposits are stripped out and reported separately. Unit Price = Full Price - Discount on every non-zero line.',''),
('COGS = (Laid-in Cost + Tax Cost - Participation) x Num Units. The invoice "Laid-in Cost" equals FOB on 92% of lines and FOB + freight on the rest (imported kegs, some crafts); it never includes excise tax, so tax is added. Participation is the supplier-funded part of a deal (a billback Kohler earns per case), so it reduces cost. This is exactly the Laid-in definition Encompass uses in the pricing export (verified: the export laid-in equals our per-case cost on 95% of matched lines; the rest differ by cents of freight rounding or are export oddities such as a negative Yuengling keg laid-in).',''),
('Gross Profit = Net Sales - COGS. Gross Margin % = total GP / total Net Sales at every level of every sheet (never an average of individual margins). GP per case = GP / cases.',''),
('Units and package sizes: every per-line price and cost in the invoice file is PER NUM UNIT, and Cases is the case-equivalent. For beer, units = cases. For spirits and wine sold by the bottle, units = bottles and Cases is fractional (a 6-pack case sold as 1 bottle = 0.1667 cases); prices and costs were multiplied by units, never by cases, so bottle-priced spirits are not mis-stated. "Net Price / Case" on the analysis sheets = Net Sales / Cases, which converts everything to a per-case basis so it can be compared with the pricing export (whose Case Price is per case even when its FOB is per bottle - the same trap the earlier workbook flagged). Kegs are one unit = one case-equivalent; keg deposits are excluded.',''),
('Front-line price = the invoice "Full Price" on the line (what Encompass says the product listed at that day). Discount $ = Full Price - Unit Price; Discount % = Discount / Full Price. "Published front-line" on the analysis sheets = the highest Case Price the product carries in the pricing export.',''),
('Brand Family = a derived roll-up of the product-name brand (first word, or a known two-word family such as Blue Moon / Sam Adams / Twisted Tea; Coronita -> Corona, Modelito -> Modelo). It is editable on "Brand Family Map" and everything keyed on it recalculates. A brand-family master from Encompass would replace this.',''),
('',''),
('DEAL LEVEL IDENTIFICATION','h'),
('The invoice export carries a Promotion Name but NOT the deal level (Min Purchase Qty) a line earned. Each sale line was therefore matched to the pricing export by product #, net price per case (to the cent) and invoice date inside the level\'s deal window:',''),
('  Identified - exactly one published level carries that price on that date, OR the line paid the invoice front-line price and level 0 is among the levels sharing it (then it is front-line by definition; 5,032 lines). 62% of sales lines / 69% of net sales. Validation: summing identified cases by product x level reproduces the export\'s own case count exactly for 3,174 of 3,935 product-levels; the rest differ only because some of their lines fall in the ambiguous bucket.',''),
('  Ambiguous - two or more published levels carry the SAME price on that date (e.g. levels 10 and 25 both at $32.25; or a one-day level 5 and level 10 override at the same price). 38% of lines / 30% of net sales. Price, cost and margin are exact for these lines - only the tier label is uncertain - so they are kept in every total and shown as their own band ("Deal price - level ambiguous") with the candidate levels listed. They are NOT assigned to a tier. Participation does not separate them either (tested). Encompass knows the level it applied; a Deal / Pricing Level field on the invoice export, or the "Pricing Analysis by Customer" report, would remove the ambiguity.',''),
('  Outside window - the price matches a published level but the invoice date falls outside that level\'s window (4 lines).',''),
('  Not on deal sheet - the price matches no published level (32 lines, ~$73k): mostly products the pricing export does not carry at all (2 Canos, one Unibroue keg) plus a handful of prices between or below published levels. All are listed on Opportunities list 5 for verification.',''),
('Deal windows in the export are per level and sometimes a single day; single-day rows look like date-specific price overrides. Deal levels are cumulative / mix-and-match minimums, so an invoice line quantity below the level minimum is normal and is not flagged.',''),
('',''),
('RETURNS, CREDITS, BREAKAGE, OUT-OF-CODE - WHAT THE FILES CONTAIN AND HOW EACH IS TREATED','h'),
('YES, the invoice files contain all four. They are recognisable by negative quantities and by special internal customer numbers; the exact counts and dollars are live on the Executive Summary memo table and on "Excluded Lines".',''),
('Too-old-for-credit zero-outs / sell-back to supplier: 20 lines carrying the Encompass promotion "TOO OLD FOR CREDIT (ZERO OUT)". Sixteen are credits zeroed to $0; four are Waterloo gin sold back to Waterloo Gin Company at below cost (~$27k revenue against ~$42k cost). EXCLUDED from net sales and margin (they are stock disposals, not customer sales); memo on the Executive Summary.',''),
('Credits / returns: 2,973 negative-quantity product lines to real customers (mostly kegs and July front-line items credited back), about -$0.87m at invoice value. INCLUDED - netted into Net Sales, COGS and cases, exactly as Encompass nets them in the pricing export. The file does not carry a credit reason, so returns cannot be separated from pricing corrections.',''),
('Breakage: customer "7 Breakage", 1,424 lines, billed at $0 with the product cost on the line. EXCLUDED from Net Sales / COGS / headline GP (it is an inventory write-off, not a sale); shown as a memo at laid-in cost + tax, with an alternative "GP after write-offs" line.',''),
('Out-of-code: customer "8 Out Of Code", 514 lines, same treatment as breakage.',''),
('Samples: customers "6 Kohler Samples Taken 100%" and "120022 Kohler Samples Taken 50%", 206 lines at $0. EXCLUDED, memo at cost.',''),
('Inventory / FIFO / GL adjustments (customers "9 Fifo Adjustment", "5 Inventory Adjustment", product "998 00998"), empty keg / cooperage returns (deposit refunds), supplier billback invoices (customer = supplier), NSF / finance-charge / write-off lines, equipment and deposit items (kiosk, cold plate, trailer, gas tank) - all EXCLUDED and listed by category with their treatment on "Excluded Lines". Supplier funding is captured per sale line through Participation instead of through billback invoices.',''),
('Zero-quantity lines: 30,001 lines with 0 cases and $0 (short-shipped or cancelled items; 5,540 of them show an Ordered quantity). No $ effect; excluded. 50 priced product lines carry no cost on file and are excluded from margin and listed for review.',''),
('',''),
('SHEET GUIDE','h'),
('Executive Summary - headline KPIs, reconciliation from the raw files to Net Sales, memo treatment of returns / write-offs, top and bottom lists, margin distribution, deal tier mix. All live formulas.',''),
('Supplier Summary / Brand Family Summary / Product Summary / Customer Summary - filterable margin tables (SUMIFS). Product and customer sheets carry a live Flags column driven by the thresholds on Opportunities.',''),
('Deal Level Analysis - one row per product x identified level x net price: actual price vs invoice front-line vs published tier, cases / sales / margin at each level, share of product volume, and exception flags. Deal Band Summary rolls it up by tier band.',''),
('Opportunities - thresholds (edit), live flag counts, and seven ranked review lists (negative margin, low margin, deepest discounts, lowest-margin accounts, prices not on the deal sheet, products living at their deepest tier, largest credits).',''),
('Scenario - Products / Scenario - Deal Levels - change prices or discounts (blue cells, per row or global) and read the resulting net sales, GP and margin at constant August volume, with a company roll-up.',''),
('Sales Lines - the audit trail: every sale / credit at customer x product x net price grain (75k rows) with SUBTOTAL totals that follow the filter. Excluded Lines - everything else in the files. Deal Ladder (Export) - the pricing export as received. Brand Family Map - editable product -> family.',''),
('Colour code: blue text on yellow = input you can change; green text = looked up from another sheet; black = formula or source value. Base sums on Deal Level Analysis (cases, sales, cost) are values summed from Sales Lines because 4,500 rows of SUMIFS over 75,000 lines would make the file too slow; everything derived from them is a formula, and the integrity checks on the Executive Summary confirm every sheet ties to Sales Lines.',''),
('',''),
('ASSUMPTIONS AND LIMITS','h'),
('- One month only: no seasonality, trend or deal-frequency view. August 2026 had 21 delivery days (8/3 - 8/31); the first two days of the month are not in the files.',''),
('- Costs are Encompass laid-in as of the invoice; no allocation of freight beyond what Encompass embeds, no warehouse / delivery cost, no supplier volume rebates or off-invoice allowances other than line Participation. "Gross profit" here is invoice gross profit.',''),
('- Participation is treated as earned supplier funding that reduces cost. If some participation is not actually collected, margin is overstated by that amount.',''),
('- Front-line = the line\'s Full Price. Where Encompass carried a stale Full Price on a line, discount % is off for that line.',''),
('- Brand family is derived; supplier for the 5 products missing from the pricing export shows as "Not in pricing export".',''),
('- Deal levels are identified only where the match is unique (see above). No level was assumed.',''),
('- Rep / area / premise come from the hub customer base and may lag account changes; accounts not in it show "(not in rep base)".',''),
('',''),
('ADDITIONAL REPORTS THAT WOULD STRENGTHEN THIS','h'),
('- Invoice export WITH the deal level / pricing tier applied per line (or Encompass "Pricing Analysis by Customer"): removes the ambiguous bucket and allows a true per-account tier analysis.',''),
('- Credit memo / return reason report: separates true returns from pricing corrections, breakage at the account and out-of-code pickups.',''),
('- Supplier deal sheets / Encompass deal groups: confirms which products mix-and-match for each level minimum and whether every account that earned a tier actually met the minimum.',''),
('- Supplier billback / participation settlement report: confirms the participation credited on invoices was collected.',''),
('- Product master with brand family, segment (import / domestic / craft / FMB / W&S) and package: replaces the derived brand family and package parsing.',''),
('- July and September (or a trailing 12 months) of the same two exports: trend, deal frequency, and whether August discounts are seasonal.',''),
('- Customer master with channel / chain flag and delivery cost by route: allows margin after cost-to-serve, the next step after invoice margin.',''),
]
for i,(t,k) in enumerate(txt):
    c=wr.cell(3+i,1,t); c.alignment=Alignment(wrap_text=True,vertical='top')
    c.font=f_sec if k=='h' else f_norm
    if k=='h': c.fill=fill_sec
# fonts default
for w in wb.worksheets:
    for row_ in w.iter_rows():
        for c in row_:
            if c.font is None or c.font.name!=FONT: 
                if c.value is not None and c.font.name!=FONT: c.font=Font(name=FONT,size=c.font.size or 10,bold=c.font.bold,italic=c.font.italic,color=c.font.color)
wb.move_sheet('Read Me',-(len(wb.sheetnames)-1)); 
order=['Read Me','Executive Summary','Supplier Summary','Brand Family Summary','Product Summary','Customer Summary','Deal Level Analysis','Deal Band Summary','Opportunities','Scenario - Products','Scenario - Deal Levels','Sales Lines','Excluded Lines','Deal Ladder (Export)','Brand Family Map']
wb._sheets=[wb[n] for n in order]
wb.active=1
wb.save(OUT); print('saved',OUT)
