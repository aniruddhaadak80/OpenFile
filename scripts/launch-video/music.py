import math, wave, array, random
SR=22050; DUR=50
chords=[[220,277.18,329.63,440],[196,246.94,293.66,392],[174.61,220,261.63,349.23],[196,246.94,293.66,392]]
buf=array.array('h')
for i in range(SR*DUR):
    t=i/SR
    ci=int(t/5)%4; ph=(t%5)/5
    nxt=chords[(ci+1)%4]; cur=chords[ci]
    x=0.0
    xf=max(0,(ph-0.85)/0.15)
    for k in range(4):
        f=cur[k]*(1-xf)+nxt[k]*xf
        x+=math.sin(2*math.pi*f*t)*0.12+math.sin(2*math.pi*f*2*t)*0.03
    # soft pulse bass on beat (120bpm)
    beat=(t*2)%1
    x+=math.sin(2*math.pi*cur[0]/2*t)*0.25*math.exp(-beat*5)
    # hihat-ish tick
    if t>10 and t<46: x+=(random.random()*2-1)*0.04*math.exp(-((t*4)%1)*30)
    env=min(1,t/3)*min(1,(DUR-t)/3)
    buf.append(int(max(-1,min(1,x*0.55*env))*32767))
w=wave.open('music.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(buf.tobytes()); w.close()
