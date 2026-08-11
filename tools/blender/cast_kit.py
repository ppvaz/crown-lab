






def distance_to_segment(point, head, tail):
    along = tail - head
    length = along.length_squared
    t = 0.0 if length < 1e-12 else max(0.0, min(1.0, (point - head).dot(along) / length))
    return (point - (head + along * t)).length


def envelope_weights(point, segments, count=3):


    nearest = sorted((distance_to_segment(point, h, t), name) for name, h, t in segments)[:count]
    raw = [(name, 1.0 / max(d, 1e-4) ** 2) for d, name in nearest]
    total = sum(w for _, w in raw)
    return [(name, w / total) for name, w in raw]
