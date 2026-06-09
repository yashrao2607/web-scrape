import urllib.request
import ssl

context = ssl._create_unverified_context()

class RedirectTracer(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        print(f"Redirect {code}: {req.full_url} -> {newurl}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

opener = urllib.request.build_opener(RedirectTracer)
urllib.request.install_opener(opener)

url = "https://www.axis.bank.in/docs/default-source/default-document-library/interest-rates/domestic-fixed-deposits-06-june-26.pdf?sfvrsn=5eb4a7d0_1"
req = urllib.request.Request(url, headers={
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
})

try:
    with urllib.request.urlopen(req, context=context) as response:
        print("Final URL:", response.url)
        print("Status code:", response.status)
        content = response.read()
        print("Content size:", len(content))
        print("Preview:", content[:100])
except Exception as e:
    print("Error:", e)
