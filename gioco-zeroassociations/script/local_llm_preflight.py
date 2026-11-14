"""Controlla la versione Qwen solo prima di un nuovo lotto di inferenza locale.

Il controllo non serve per esportare CSV già revisionati o per validarli.
Non scarica pesi e non cambia modello a metà lotto.
"""
from datetime import datetime,timezone
import json
from pathlib import Path
import re
import urllib.request

ROOT=Path(__file__).parent.parent
GENERAL_DENSE=re.compile(r'Qwen/Qwen(?P<version>\d+(?:\.\d+)?)-(?P<size>\d+)B$')


def select_latest(models,max_dense_billions=32):
    candidates=[]
    for model in models:
        identifier=model.get('id','')
        match=GENERAL_DENSE.fullmatch(identifier)
        if match and int(match['size'])<=max_dense_billions:
            version=tuple(map(int,match['version'].split('.')))
            candidates.append((version,int(match['size']),identifier))
    if not candidates:raise ValueError('Nessun modello ufficiale generalista compatibile trovato')
    return max(candidates)[2]


def get_json(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Zerocade-model-version-check'})
    with urllib.request.urlopen(req,timeout=45) as response:return json.load(response)


def check_new_batch(policy=None):
    policy=policy or json.loads((ROOT/'resources/local_llm_policy.json').read_text(encoding='utf-8'))
    models=get_json('https://huggingface.co/api/models?author=Qwen&sort=lastModified&direction=-1&limit=1000')
    selected=select_latest(models)
    details=get_json('https://huggingface.co/api/models/'+selected)
    if selected!=policy['selected_base_model']:
        raise ValueError('Nuova versione ufficiale rilevata: '+selected+'. Aggiornare e verificare il modello locale prima del nuovo lotto; nessun ripiego automatico.')
    return {'checked_at':datetime.now(timezone.utc).isoformat(),'official_model':selected,
            'official_revision':details['sha'],'quantization_repository':policy['quantization_repository'],
            'quantization_revision':policy['quantization_revision'],'model_sha256':policy['model_sha256']}


if __name__=='__main__':print(json.dumps(check_new_batch(),ensure_ascii=False,indent=2))
