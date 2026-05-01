# Deployment Checklist

## ก่อน Deploy ทุกครั้ง

### Phase 1: Code Review
- [ ] git status — ไม่มี uncommitted changes
- [ ] git log — รู้ว่าอะไรเปลี่ยนบ้าง
- [ ] git pull — latest จาก remote
- [ ] ไม่มี merge conflict

### Phase 2: Build Verification
- [ ] `npm run build` — ผ่าน (0 errors)
- [ ] `node --check dist/assets/*.js` — syntax ถูกต้อง
- [ ] CSS file ถูกสร้าง (`ls packages/web/dist/assets/*.css`)
- [ ] index.html มี script src ถูกต้อง

### Phase 3: Container Build
- [ ] `docker compose build erp-web-dashboard` — ผ่าน
- [ ] `docker compose up -d erp-web-dashboard` — container ทำงาน
- [ ] `docker ps | grep erp-web-dashboard` — status healthy

### Phase 4: Smoke Test
- [ ] `curl -s -o /dev/null -w "%{http_code}" http://localhost:53020/` → 200
- [ ] `curl -s http://localhost:53020/ | grep -q "root"` → มี div#root
- [ ] JS file ถูก serve → HTTP 200
- [ ] CSS file ถูก serve → HTTP 200

### Phase 5: Proxy Test (nginx 54509)
- [ ] `curl -s -o /dev/null -w "%{http_code}" http://localhost:54509/` → 200
- [ ] JS ผ่าน proxy → HTTP 200
- [ ] `tail -5 /var/log/nginx/erp-error.log` → ไม่มี new errors

### Phase 6: Browser Check
- [ ] เปิดหน้าเว็บ — ไม่ blank
- [ ] F12 Console — ไม่มี errors
- [ ] F12 Network — JS/CSS โหลดครบ (HTTP 200)
- [ ] ทดสอบ navigation — เปลี่ยนหน้าได้
- [ ] ทดสอบ API calls — ข้อมูลโหลด

---

## Rollback Plan

### ถ้า production มีปัญหา:
```bash
# 1. revert commit
git revert HEAD --no-edit && git push

# 2. rebuild + redeploy
docker compose up -d --build erp-web-dashboard

# 3. ตรวจสอบ
curl -s http://localhost:53020/ | grep -q "root" && echo "OK"
```

### ถ้า nginx proxy มีปัญหา:
```bash
nginx -t -c /etc/nginx/erp-standalone.conf
nginx -c /etc/nginx/erp-standalone.conf -s reload
tail -20 /var/log/nginx/erp-error.log
```

---

## Post-Deploy Monitoring (5 นาทีหลัง deploy)
```bash
tail -10 /var/log/nginx/erp-error.log
docker ps --format "table {{.Names}}\t{{.Status}}"
curl -s http://localhost:54510/api/health
```

### อาการที่พบบ่อย:
| อาการ | สาเหตุ | วิธีแก้ |
|-------|--------|--------|
| Blank page | JS syntax error, missing quotes | ดู browser console → fix → rebuild |
| 404 assets | Vite build ไม่สมบูรณ์ | `npm run build` ใหม่ |
| nginx 502 | Container ไม่ทำงาน | `docker ps` → restart container |
| CSS ไม่มา | CSS file หาย | ตรวจสอบ dist/assets/ |
