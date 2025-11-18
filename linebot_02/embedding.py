import sys
from sentence_transformers import SentenceTransformer
import json

# 取得命令列參數
text = sys.argv[1] if len(sys.argv) > 1 else ""

# 載入模型
model = SentenceTransformer('all-MiniLM-L6-v2')

# 產生 embedding
embedding = model.encode(text)

# 輸出為 JSON 格式
print(json.dumps(embedding.tolist()))
