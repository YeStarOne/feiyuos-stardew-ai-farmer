# 农作物死亡审计: 扫所有存档快照, 统计 season/day/作物数/死株/浇水数, 找出"哪一天死的"
# 用法: python crop-audit.py            (默认扫 save-backups + live 存档)
import io, os, re, sys, zipfile, glob

SNAP = 'D:/StardewAI/save-backups'
LIVE = 'C:/Users/Administrator/AppData/Roaming/StardewValley/Saves/肥鱼肥鱼_452739119'
SAVE = '肥鱼肥鱼_452739119'

def read_xml(path):
    with open(path, 'rb') as f:
        head = f.read(4)
    if head[:2] == b'PK':
        with zipfile.ZipFile(path) as z:
            name = [n for n in z.namelist() if not n.endswith('SaveGameInfo')][0]
            return z.read(name).decode('utf-8', 'replace')
    return open(path, 'r', encoding='utf-8', errors='replace').read()

def summerize(xml):
    # Farm 位置块: 取 '<GameLocation xsi:type="Farm"' 到下一个 xsi:type= 的位置(粗略但够用)
    i = xml.find('xsi:type="Farm"')
    seg = xml[i:i + 400000] if i >= 0 else xml
    dead = len(re.findall(r'<dead>true</dead>', seg))
    alive = len(re.findall(r'<dead>false</dead>', seg))
    seeds = re.findall(r'<seedIndex>(-?\d+)</seedIndex>', seg)
    bodies = re.findall(r'<currentPhase>(\d+)</currentPhase>', seg)
    return {
        'season': (re.search(r'<season>(\w+)</season>', xml) or [None, '?'])[1],
        'day': (re.search(r'<dayOfMonth>(\d+)</dayOfMonth>', xml) or [None, '?'])[1],
        'year': (re.search(r'<year>(\d+)</year>', xml) or [None, '?'])[1],
        'crops': len(seeds), 'dead': dead, 'alive_crop_obj': alive,
        'phases': bodies[:50],
        'money': (re.search(r'<money>(\d+)</money>', xml) or [None, '?'])[1],
    }

def scan(savefile, label):
    try:
        s = summerize(read_xml(savefile))
        print(f"{label:34s} Y{s['year']} {s['season']}{s['day']:>2} 钱{s['money']:>6} 作物{s['crops']:>3} 死株{s['dead']:>3} dead=false {s['alive_crop_obj']:>3}")
        return s
    except Exception as e:
        print(f"{label:34s} !! {e}")
        return None

if __name__ == '__main__':
    print('== live ==')
    scan(os.path.join(LIVE, SAVE), 'LIVE(当前运行中)')
    print('== 快照(旧→新) ==')
    for d in sorted(glob.glob(os.path.join(SNAP, '*'))):
        p = os.path.join(d, SAVE)
        if os.path.exists(p):
            scan(p, os.path.basename(d))
