import math, re, subprocess, sys, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS, DUR = 1920, 1080, 30, 50
F = 'fonts/'
def font(name, size, weight='Bold'):
    f = ImageFont.truetype(F + name, size)
    try: f.set_variation_by_name(weight)
    except Exception: pass
    return f
reg = open('/workspace/work/OpenFile/src/tools/registry.ts').read()
tools = re.findall(r"name: '([^']+)', desc", reg)
cats = [('PDF Tools','#ef4444'),('Convert','#f97316'),('Image','#22c55e'),('Video','#8b5cf6'),('Audio','#ec4899'),('Developer','#06b6d4'),('Text & Data','#eab308'),('Design','#3b82f6')]
counts = {}
for c in ['pdf','convert','image','video','audio','dev','text','design']:
    counts[c] = len(re.findall(r"category: '%s'" % c, reg))
ccount = list(counts.values())
ACC, ACC2, BG, SURF, BORDER, FG, MUTED = (139,108,255), (34,211,238), (7,8,13), (15,17,25), (35,40,56), (238,240,248), (139,145,168)

def hexrgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def ease(t): t=max(0,min(1,t)); return 1-(1-t)**3
def ease_io(t): t=max(0,min(1,t)); return t*t*(3-2*t)
def lerp(a,b,t): return a+(b-a)*t
def mix(c1,c2,t): return tuple(int(lerp(a,b,t)) for a,b in zip(c1,c2))

# precomputed background: dark with two glows + grid
def make_bg():
    img = Image.new('RGB',(W,H),BG)
    glow = Image.new('RGB',(W,H),(0,0,0))
    g = ImageDraw.Draw(glow)
    g.ellipse((W*0.15,-H*0.5,W*0.65,H*0.45),fill=(70,50,160))
    g.ellipse((W*0.45,-H*0.45,W*0.95,H*0.4),fill=(10,90,120))
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    img = Image.blend(img, glow, 0.55)
    d = ImageDraw.Draw(img)
    for x in range(0,W,60): d.line((x,0,x,H),fill=(18,20,30))
    for y in range(0,H,60): d.line((0,y,W,y),fill=(18,20,30))
    return img
BGIMG = make_bg()

def gradient_text(d_img, xy, text, f, anchor='mm', alpha=1.0):
    # render text mask then fill with horizontal gradient
    tmp = Image.new('L',(W,H),0); ImageDraw.Draw(tmp).text(xy,text,font=f,fill=int(255*alpha),anchor=anchor)
    bbox = tmp.getbbox()
    if not bbox: return
    grad = Image.new('RGB',(W,H))
    gd = ImageDraw.Draw(grad)
    x0,x1 = bbox[0],bbox[2]
    for x in range(x0,x1+1):
        t=(x-x0)/max(1,x1-x0)
        c = mix(ACC,ACC2,min(1,t*1.6)) if t<0.62 else mix(ACC2,(244,114,182),(t-0.62)/0.38)
        gd.line((x,bbox[1],x,bbox[3]),fill=c)
    d_img.paste(grad,(0,0),tmp)

def text(d, xy, s, f, fill=FG, alpha=1.0, anchor='mm'):
    c = tuple(int(lerp(b,a,alpha)) for a,b in zip(fill,BG)) if alpha<1 else fill
    d.text(xy,s,font=f,fill=c,anchor=anchor)

def rrect(d, box, r, fill=None, outline=None, width=2):
    d.rounded_rectangle(box, r, fill=fill, outline=outline, width=width)

def logo(img, cx, cy, size, alpha=1.0):
    L = Image.new('RGBA',(size,size),(0,0,0,0))
    ld = ImageDraw.Draw(L)
    g = Image.new('RGBA',(size,size))
    gd = ImageDraw.Draw(g)
    for i in range(size*2):
        c = mix(ACC,ACC2,i/(size*2)); gd.line((i,0,0,i),fill=c+(255,))
    m = Image.new('L',(size,size),0); ImageDraw.Draw(m).rounded_rectangle((0,0,size-1,size-1),int(size*0.25),fill=255)
    L.paste(g,(0,0),m)
    s=size/64
    ld.rounded_rectangle((18*s,14*s,46*s,52*s),int(4*s),fill=(255,255,255,245))
    ld.polygon([(36*s,14*s),(46*s,24*s),(36*s,24*s)],fill=(200,200,240,255))
    ld.ellipse((25*s,31*s,39*s,45*s),outline=ACC+(255,),width=max(2,int(3.5*s)))
    if alpha<1:
        a = L.split()[3].point(lambda v:int(v*alpha)); L.putalpha(a)
    img.paste(L,(int(cx-size/2),int(cy-size/2)),L)

def scene_intro(img,d,t):
    a = ease(t/1.2)
    sz = int(lerp(60,220,a))
    logo(img, W/2, H/2-90, sz, a)
    if t>1.0:
        a2 = ease((t-1.0)/0.8)
        f = font('SpaceGrotesk.ttf', 150)
        n = int(len('OpenFile')*min(1,(t-1.0)/0.9))
        text(d,(W/2,H/2+120-20*(1-a2)),'OpenFile'[:max(1,n)],f,alpha=a2)
    if t>2.3:
        a3=ease((t-2.3)/0.8)
        text(d,(W/2,H/2+230),'Every file tool. In your browser.',font('Inter.ttf',44,'Medium'),fill=MUTED,alpha=a3)

def scene_tagline(img,d,t):
    a=ease(t/0.8); b=ease((t-0.6)/0.8)
    f=font('SpaceGrotesk.ttf',130)
    text(d,(W/2,H/2-90+30*(1-a)),'Every file tool.',f,alpha=a)
    if t>0.6: gradient_text(img,(W/2,H/2+70+30*(1-b)),'One private browser tab.',f,alpha=b)
    if t>1.6:
        c=ease((t-1.6)/0.8)
        text(d,(W/2,H/2+230),f'{len(tools)} tools  ·  zero uploads  ·  free & open source',font('Inter.ttf',40,'Medium'),fill=MUTED,alpha=c)

def scene_categories(img,d,t):
    text(d,(W/2,150),'Eight studios. One workbench.',font('SpaceGrotesk.ttf',72),alpha=ease(t/0.6))
    cw,ch,gap=400,250,36
    x0=(W-(cw*4+gap*3))/2; y0=270
    for i,(name,col) in enumerate(cats):
        k=ease((t-0.3-i*0.12)/0.6)
        if k<=0: continue
        r,cidx=divmod(i,4)
        x=x0+cidx*(cw+gap); y=y0+r*(ch+gap)+40*(1-k)
        c=hexrgb(col)
        rrect(d,(x,y,x+cw,y+ch),28,fill=mix(BG,SURF,k),outline=mix(BG,mix(BORDER,c,0.5),k),width=2)
        d.rounded_rectangle((x+30,y+30,x+100,y+100),18,fill=mix(BG,mix(SURF,c,0.25),k))
        d.ellipse((x+52,y+52,x+78,y+78),fill=mix(BG,c,k))
        text(d,(x+30,y+150),name,font('SpaceGrotesk.ttf',40),alpha=k,anchor='lm')
        text(d,(x+30,y+200),f'{ccount[i]} tools',font('Inter.ttf',28,'Medium'),fill=MUTED,alpha=k,anchor='lm')

def scene_marquee(img,d,t):
    a=ease(t/0.6)
    gradient_text(img,(W/2,170),f'{len(tools)} tools and counting',font('SpaceGrotesk.ttf',96),alpha=a)
    f=font('Inter.ttf',36,'SemiBold')
    rows=[tools[i::4] for i in range(4)]
    for ri,row in enumerate(rows):
        y=330+ri*165
        speed=(140 if ri%2==0 else -140)
        off=t*speed + ri*300
        # build pill positions
        x=-2000+ (off % 600) - 600
        i=0
        while x<W+400:
            s=row[i%len(row)]; i+=1
            tw=d.textlength(s,font=f)+70
            col=hexrgb(cats[(i+ri)%8][1])
            rrect(d,(x,y,x+tw,y+96),48,fill=SURF,outline=mix(BORDER,col,0.45),width=2)
            d.ellipse((x+26,y+40,x+42,y+56),fill=col)
            text(d,(x+56,y+48),s,f,anchor='lm',alpha=a)
            x+=tw+28

def window(d,box,title):
    x0,y0,x1,y1=box
    rrect(d,box,28,fill=SURF,outline=BORDER,width=2)
    d.line((x0,y0+64,x1,y0+64),fill=BORDER,width=2)
    for i,c in enumerate([(255,95,87),(254,188,46),(40,200,64)]): d.ellipse((x0+28+i*30,y0+24,x0+44+i*30,y0+40),fill=c)
    text(d,(x0+140,y0+32),title,font('JetBrainsMono.ttf',24,'Medium'),fill=MUTED,anchor='lm')

def scene_merge(img,d,t):
    text(d,(W/2,120),'Merge, split, sign, compress.',font('SpaceGrotesk.ttf',72),alpha=ease(t/0.5))
    window(d,(260,210,W-260,H-90),'openfile / merge-pdf')
    files=[('report-q3.pdf','12 pages','#ef4444'),('contract.pdf','4 pages','#f97316'),('invoice-0921.pdf','1 page','#22c55e')]
    for i,(n,p,c) in enumerate(files):
        k=ease((t-0.3-i*0.25)/0.5)
        mv=ease((t-2.4)/0.9)
        x=lerp(330,W/2-160,mv); y=lerp(320+i*150,470,mv)
        if k<=0: continue
        rrect(d,(x,y,x+560*(1-mv*0.43),y+120),20,fill=mix(SURF,(30,34,48),k),outline=BORDER)
        d.rounded_rectangle((x+24,y+28,x+84,y+92),12,fill=hexrgb(c))
        if mv<0.6:
            text(d,(x+110,y+45),n,font('Inter.ttf',32,'SemiBold'),anchor='lm',alpha=k*(1-mv))
            text(d,(x+110,y+85),p,font('Inter.ttf',24,'Medium'),fill=MUTED,anchor='lm',alpha=k*(1-mv))
    if t>1.2:
        pk=min(1,(t-1.2)/2.0)
        bx=W-760; by=380
        text(d,(bx,by),'Merge PDF',font('SpaceGrotesk.ttf',48),anchor='lm')
        text(d,(bx,by+60),'Drag to reorder · ranges per file',font('Inter.ttf',26,'Medium'),fill=MUTED,anchor='lm')
        rrect(d,(bx,by+120,bx+440,by+136),8,fill=(30,34,48))
        g=int(440*ease_io(pk))
        if g>16: rrect(d,(bx,by+120,bx+g,by+136),8,fill=ACC)
        text(d,(bx,by+180),f'{int(pk*100)}%',font('JetBrainsMono.ttf',30,'Bold'),anchor='lm')
    if t>3.6:
        k=ease((t-3.6)/0.5)
        bx=W-760; by=650
        rrect(d,(bx,by,bx+500,by+130),24,fill=mix(SURF,(16,60,36),k),outline=mix(SURF,(34,197,94),k))
        text(d,(bx+40,by+48),'✓  merged.pdf  ·  17 pages',font('Inter.ttf',32,'SemiBold'),anchor='lm',alpha=k)
        text(d,(bx+40,by+92),'Done in 0.4 s — on your device',font('Inter.ttf',26,'Medium'),fill=(34,197,94),anchor='lm',alpha=k)

def scene_privacy(img,d,t):
    a=ease(t/0.6)
    # lock
    cx,cy=W/2,330
    s=lerp(0.6,1,a)
    d.rounded_rectangle((cx-110*s,cy-40*s,cx+110*s,cy+130*s),30,fill=mix(BG,ACC,a))
    d.arc((cx-75*s,cy-150*s,cx+75*s,cy+20*s),180,360,fill=mix(BG,ACC2,a),width=int(26*s))
    d.ellipse((cx-20*s,cy+25*s,cx+20*s,cy+65*s),fill=BG)
    gradient_text(img,(W/2,600),'0 bytes uploaded.',font('SpaceGrotesk.ttf',120),alpha=ease((t-0.4)/0.6))
    items=['WebAssembly','WebGPU','On-device AI','Works offline','No sign-up','No watermarks']
    f=font('Inter.ttf',32,'SemiBold')
    tot=sum(d.textlength(s,font=f)+80 for s in items)+20*(len(items)-1)
    x=(W-tot)/2
    for i,s in enumerate(items):
        k=ease((t-1.0-i*0.12)/0.4)
        tw=d.textlength(s,font=f)+80
        if k>0:
            rrect(d,(x,760,x+tw,840),40,fill=mix(BG,SURF,k),outline=mix(BG,BORDER,k))
            text(d,(x+tw/2,800),s,f,alpha=k)
        x+=tw+20

def scene_pipeline(img,d,t):
    text(d,(W/2,130),'Automate it with Workspace.',font('SpaceGrotesk.ttf',72),alpha=ease(t/0.5))
    text(d,(W/2,205),'Chain tools into recipes. Run them on hundreds of files.',font('Inter.ttf',34,'Medium'),fill=MUTED,alpha=ease((t-0.3)/0.5))
    steps=['Resize to 1600px','Watermark','Strip EXIF','Convert to WebP','Download ZIP']
    active=(t-0.8)/0.8
    for i,s in enumerate(steps):
        y=300+i*130
        k=ease((t-0.2-i*0.1)/0.4)
        if k<=0: continue
        state='done' if active>i+1 else ('run' if active>i else 'wait')
        oc = (34,197,94) if state=='done' else (ACC if state=='run' else BORDER)
        fc = (14,30,22) if state=='done' else ((26,22,48) if state=='run' else SURF)
        x0=W/2-420; x1=W/2+420
        rrect(d,(x0,y,x1,y+104),24,fill=mix(BG,fc,k),outline=mix(BG,oc,k),width=3)
        d.ellipse((x0+30,y+30,x0+74,y+74),fill=mix(BG,oc if state!='wait' else (40,45,60),k))
        text(d,(x0+52,y+52),'✓' if state=='done' else str(i+1),font('Inter.ttf',26,'Bold'),alpha=k)
        text(d,(x0+104,y+52),s,font('Inter.ttf',34,'SemiBold'),anchor='lm',alpha=k)
        if state=='run':
            p=active-i
            rrect(d,(x1-260,y+46,x1-40,y+58),6,fill=(40,45,60))
            if p*220>12: rrect(d,(x1-260,y+46,x1-260+220*p,y+58),6,fill=ACC)
    text(d,(W/2,H-70),'248 files  ·  processed locally',font('JetBrainsMono.ttf',28,'Medium'),fill=MUTED,alpha=ease((t-0.5)/0.5))

def scene_cta(img,d,t):
    a=ease(t/0.8)
    logo(img,W/2,330,int(lerp(120,180,a)),a)
    text(d,(W/2,540),'OpenFile',font('SpaceGrotesk.ttf',140),alpha=a)
    gradient_text(img,(W/2,670),'Free. Open source. Private.',font('SpaceGrotesk.ttf',64),alpha=ease((t-0.5)/0.6))
    if t>1.2:
        k=ease((t-1.2)/0.6)
        f=font('JetBrainsMono.ttf',36,'Medium'); s='github.com/aniruddhaadak80/OpenFile'
        tw=d.textlength(s,font=f)+90
        rrect(d,(W/2-tw/2,800,W/2+tw/2,884),42,fill=mix(BG,SURF,k),outline=mix(BG,ACC,k),width=2)
        text(d,(W/2,842),s,f,alpha=k)

SCENES=[(0,5,scene_intro),(5,10,scene_tagline),(10,17,scene_categories),(17,24,scene_marquee),(24,32,scene_merge),(32,38,scene_privacy),(38,45,scene_pipeline),(45,50,scene_cta)]

def frame(tt):
    img=BGIMG.copy(); d=ImageDraw.Draw(img)
    for s,e,fn in SCENES:
        if s<=tt<e:
            fn(img,d,tt-s)
            # fade in/out between scenes
            fade=min(1,(tt-s)/0.35, (e-tt)/0.35 if fn is not scene_cta else 1)
            if fade<1: img=Image.blend(BGIMG,img,max(0,fade))
            break
    return img

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='poster':
        frame(float(sys.argv[2])).save(sys.argv[3], quality=90); sys.exit()
    p=subprocess.Popen(['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i','music.wav','-c:v','libx264','-preset','medium','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart','launch.mp4'],stdin=subprocess.PIPE,stderr=subprocess.DEVNULL)
    for i in range(DUR*FPS):
        p.stdin.write(frame(i/FPS).tobytes())
    p.stdin.close(); p.wait(); print('done')
