import sys

with open("backend/apps/requests/api/serializers.py", "r", encoding="utf-8") as f:
    text = f.read()

target = """class QuoteListSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    version = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    status = serializers.CharField()"""

replacement = """class QuoteListSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    version = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    payment_plan = serializers.CharField(allow_null=True, required=False)
    status = serializers.CharField()"""

if target in text:
    text = text.replace(target, replacement)
    with open("backend/apps/requests/api/serializers.py", "w", encoding="utf-8") as f:
        f.write(text)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND")
