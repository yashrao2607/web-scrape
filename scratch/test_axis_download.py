import urllib.request
import ssl

context = ssl._create_unverified_context()
url = "https://www.axisbank.com/docs/default-source/interest-rate/interest-rates-on-deposits.pdf"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, context=context) as response:
        print("Status:", response.status)
        print("Content-Type:", response.getheader("Content-Type"))
        content = response.read()
        print("Content Length:", len(content))
        print("First 200 bytes:", content[:200])
except Exception as e:
    print("Error:", e)
