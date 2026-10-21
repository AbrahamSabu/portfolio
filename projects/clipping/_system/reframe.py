"""Reframe 16:9 -> 9:16, following real shot changes only."""

_WARNED = False


def _probe_size(video_path):
    import json
    import subprocess
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "json", video_path],
        capture_output=True, text=True, check=True,
    ).stdout
    s = json.loads(out)["streams"][0]
    return int(s["width"]), int(s["height"])


def _crop_box(cx, cy, src_w, src_h, target_w, target_h):
    target_ratio = target_w / target_h
    src_ratio = src_w / src_h
    if src_ratio > target_ratio:
        crop_h = src_h
        crop_w = int(round(src_h * target_ratio))
    else:
        crop_w = src_w
        crop_h = int(round(src_w / target_ratio))
    crop_x = int(round(cx - crop_w / 2))
    crop_y = int(round(cy - crop_h / 2))
    crop_x = max(0, min(crop_x, src_w - crop_w))
    crop_y = max(0, min(crop_y, src_h - crop_h))
    return {"cw": crop_w, "ch": crop_h, "cx": crop_x, "cy": crop_y,
            "target_w": target_w, "target_h": target_h}


def _sample_faces(video_path, start, end, step=0.1):
    global _WARNED
    try:
        import cv2
    except ImportError:
        return None

    if not hasattr(cv2, "CascadeClassifier") or not hasattr(cv2, "data"):
        if not _WARNED:
            print("      note: OpenCV lacks face detection, using centre crop")
            _WARNED = True
        return None

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None

    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    try:
        cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        if cascade.empty():
            cap.release()
            return None
    except Exception:
        cap.release()
        return None

    samples = []
    prev_cx = None
    t = start
    while t < end:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            samples.append((round(t - start, 2), None, None))
            t += step
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5,
                                         minSize=(60, 60))
        if len(faces) == 0:
            samples.append((round(t - start, 2), None, None))
        else:
            if prev_cx is None:
                fx, fy, fw, fh = max(faces, key=lambda r: r[2] * r[3])
            else:
                fx, fy, fw, fh = min(
                    faces, key=lambda r: abs((r[0] + r[2] / 2.0) - prev_cx))
            cx = fx + fw / 2.0
            samples.append((round(t - start, 2), cx, fy + fh / 2.0))
            prev_cx = cx
        t += step

    cap.release()
    if not samples:
        return None
    return samples, src_w, src_h


def _median(vals, fallback):
    if not vals:
        return fallback
    vals = sorted(vals)
    return vals[len(vals) // 2]


def compute_crop_path(video_path, start, end, target_w=1080, target_h=1920,
                      step=0.1, jump_frac=0.18, hold=12, min_dur=1.5):
    duration = end - start
    got = _sample_faces(video_path, start, end, step=step)

    if got is None:
        src_w, src_h = _probe_size(video_path)
        return [{"t0": 0.0, "t1": duration,
                 "crop": _crop_box(src_w / 2, src_h / 2, src_w, src_h,
                                   target_w, target_h)}]

    samples, src_w, src_h = got
    known = [(t, cx, cy) for t, cx, cy in samples if cx is not None]

    if not known:
        return [{"t0": 0.0, "t1": duration,
                 "crop": _crop_box(src_w / 2, src_h / 2, src_w, src_h,
                                   target_w, target_h)}]

    thresh = src_w * jump_frac
    segs = []
    seg_start = 0.0
    cur_x, cur_y = [known[0][1]], [known[0][2]]
    anchor = known[0][1]
    pending = []

    for i in range(1, len(known)):
        t, cx, cy = known[i]
        if abs(cx - anchor) > thresh:
            pending.append((t, cx, cy))
            if len(pending) >= hold:
                spread = max(p[1] for p in pending) - min(p[1] for p in pending)
                if spread < thresh:
                    segs.append([seg_start, pending[0][0],
                                 _median(cur_x, src_w / 2),
                                 _median(cur_y, src_h / 2)])
                    seg_start = pending[0][0]
                    cur_x = [p[1] for p in pending]
                    cur_y = [p[2] for p in pending]
                    anchor = _median(cur_x, src_w / 2)
                    pending = []
                else:
                    pending.pop(0)
        else:
            pending = []
            cur_x.append(cx)
            cur_y.append(cy)

    segs.append([seg_start, duration, _median(cur_x, src_w / 2),
                 _median(cur_y, src_h / 2)])

    merged = []
    for s in segs:
        if merged and (s[1] - s[0]) < min_dur:
            merged[-1][1] = s[1]
        else:
            merged.append(s)

    merged[0][0] = 0.0
    merged[-1][1] = duration

    return [{"t0": round(a, 2), "t1": round(b, 2),
             "crop": _crop_box(cx, cy, src_w, src_h, target_w, target_h)}
            for a, b, cx, cy in merged]


def compute_crop(video_path, start, end, target_w=1080, target_h=1920, samples=12):
    path = compute_crop_path(video_path, start, end, target_w, target_h)
    return path[0]["crop"]
