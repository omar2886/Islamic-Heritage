import json, sys, os

ROOT = os.path.dirname(os.path.dirname(__file__))
SAMPLES = os.path.join(ROOT, "samples")

def assert_payload_shape(obj):
    assert isinstance(obj, dict), "payload debe ser objeto"
    assert "heirs" in obj and isinstance(obj["heirs"], list), "falta heirs[]"
    assert "estate_value" in obj or "amount" in obj, "falta estate_value/amount"
    for h in obj["heirs"]:
        assert isinstance(h, dict) and "role" in h and "count" in h, "heir con campos faltantes"
        assert isinstance(h["role"], str) and isinstance(h["count"], int), "tipos inválidos en heir"

def assert_case_shape(obj):
    assert isinstance(obj, dict), "case debe ser objeto"
    for k in ("version","meta","estate_value","counts","persons"):
        assert k in obj, f"falta {k}"
    assert isinstance(obj["meta"], dict) and "sex" in obj["meta"], "meta inválido"
    assert isinstance(obj["counts"], dict), "counts debe ser objeto"
    assert isinstance(obj["persons"], list), "persons debe ser array"
    for p in obj["persons"]:
        for f in ("id","sex","alive","role"):
            assert f in p, f"persona sin {f}"

def load(fname):
    with open(os.path.join(SAMPLES, fname), "r", encoding="utf-8") as f:
        return json.load(f)

def main():
    # payloads
    p1 = load("payload_wife_daughter.json"); assert_payload_shape(p1)
    p2 = load("payload_min_parents.json");   assert_payload_shape(p2)
    # case file
    c1 = load("case_wife_daughter.json");    assert_case_shape(c1)
    print("✅ SPRINT6 schema OK")

if __name__ == "__main__":
    try: main()
    except AssertionError as e:
        print("❌ SPRINT6 schema FAIL:", e); sys.exit(1)
