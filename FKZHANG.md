# 发送 文件 APP MSG

```javascript
const res = await msgApi.SendApp({
  "ToWxid": toWxid,
  "Type": 6,
  "Wxid": config?.wxid,
  "Xml": `<appmsg appid='wxeb7ec651dd0aefa9' sdkver=''><title>${fileName}</title><des></des><action></action><type>6</type><content></content><url></url><lowurl></lowurl><appattach><totallen>${size}</totallen><attachid>${mediaId}</attachid><fileext>${ext}</fileext></appattach><extinfo></extinfo></appmsg>`
})
```
ps: appid 可以不用也可以随便写