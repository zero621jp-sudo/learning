import json,re,sys,os,glob
import numpy as np
from PIL import Image
S=sys.argv[1]; OUT=sys.argv[2]
o=json.load(open(f'{S}/ocr.json'))
pages={}
for p,arr in o.items():
    n=os.path.basename(p)[:-4]; ex,pg=n.rsplit('_p',1); pages.setdefault(ex,{})[int(pg)]=(p,arr)
OVR={('2023r05a_koudo_am1',9):(7,0.106,0.117)}
LBL=re.compile(r'^\s*[問間闇閥]\s*(\d{1,3})')
YT,YB=0.075,0.925
result={}
for ex in sorted(pages):
    exp=30 if 'am1' in ex else 25
    starts=[]; k=1
    for pg in sorted(pages[ex]):
        if pg==0: continue
        for t in sorted(pages[ex][pg][1],key=lambda t:t['y']):
            if (ex,k) in OVR and OVR[(ex,k)][0]==pg and t['y']>OVR[(ex,k)][1]-0.01:
                starts.append(OVR[(ex,k)]); k+=1
            if k>exp or not (YT<t['y']<YB) or t['x']>0.2: continue
            m=LBL.match(t['t'])
            if m and m.group(1).startswith(str(k)):
                starts.append((pg,t['y'],t['x'])); k+=1
    if len(starts)!=exp:
        print('FAIL',ex,len(starts)); continue
    # determine content pages: from first start page to last start page (+ continuation pages that have no starts but text, before notes page)
    qs=[]
    for i,(pg,y,x) in enumerate(starts):
        parts=[]
        if i+1<len(starts):
            npg,ny,_=starts[i+1]
        else:
            npg,ny=pg,YB
        cp,cy=pg,y-0.012
        while True:
            if cp==npg: parts.append((cp,cy,ny-0.012)); break
            parts.append((cp,cy,YB)); cp+=1; cy=YT
        qs.append(dict(parts=parts,x=x))
    os.makedirs(f'{OUT}/{ex}',exist_ok=True)
    meta=[]
    for qi,q in enumerate(qs):
        crops=[]
        for (pg,y0,y1) in q['parts']:
            im=Image.open(pages[ex][pg][0]).convert('L'); W,H=im.size
            x0=int((q['x']-0.015)*W)
            reg=np.array(im.crop((0,int(y0*H),W,int(y1*H))))
            ink=reg<140
            ink[:, :max(0,x0-5)]=False
            ink[:, int((q['x']+0.83)*W):]=False
            rows=np.where(ink.sum(1)>1)[0]
            if len(rows)==0: continue
            cols=np.where(ink[rows.min():rows.max()+1].any(0))[0]
            x1=max(int((q['x']+0.79)*W), int(cols.max())+10)
            if crops and rows.max()-rows.min()<40: continue
            c=im.crop((x0,int(y0*H)+max(0,rows.min()-12),min(W,x1),int(y0*H)+rows.max()+14))
            crops.append(c)
        w=max(c.width for c in crops); h=sum(c.height for c in crops)+20*(len(crops)-1)
        canvas=Image.new('L',(w,h),255); yy=0
        for c in crops: canvas.paste(c,(0,yy)); yy+=c.height+20
        tw=1000; canvas=canvas.resize((tw,int(h*tw/w)),Image.LANCZOS) if w>tw else canvas
        canvas=canvas.point(lambda v: 255 if v>225 else v).quantize(16)
        fn=f'{OUT}/{ex}/q{qi+1:02d}.png'; canvas.save(fn,optimize=True)
        meta.append(dict(n=qi+1,parts=len(crops),w=canvas.width,h=canvas.height))
    result[ex]=meta
    print(ex,'ok',[m['n'] for m in meta if m['parts']>1])
json.dump(result,open(f'{OUT}/meta.json','w'))
