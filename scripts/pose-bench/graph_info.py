"""What a captured Day graph says about the pose: the engine, the pose words, whether a map rode.

Imported by replay.py / report.py; run alone to print a capture:
    python3 scripts/pose-bench/graph_info.py <capture.json>
"""
import json
import re
import sys

TEXT_NODES = ('TextEncodeQwenImage21', 'TextEncodeQwenImageEditPlus', 'TextEncodeQwenImageEdit',
              'CLIPTextEncode', 'TextEncodeQwenImageEditPlusAdvance')


def graph_of(body):
    return body.get('prompt', body) if isinstance(body, dict) else None


def prompt_text(graph):
    """The longest positive prompt string in the graph."""
    texts = []
    for node in graph.values():
        for key in ('prompt', 'text'):
            value = node.get('inputs', {}).get(key)
            if isinstance(value, str) and len(value) > 40:
                texts.append(value)
    return max(texts, key=len) if texts else ''


def pose_words(text):
    """POSE FIRST line and the recipe's Pose: sentence."""
    first = re.search(r'POSE FIRST:\s*(.*?)(?:\.\s|\.$|\n)', text)
    sentence = re.search(r'\bPose:\s*(.*?)\.(?=\s|$)', text)
    return {
        'poseFirst': first.group(1).strip() if first else None,
        'poseSentence': sentence.group(1).strip() if sentence else None,
    }


def info(graph):
    images = [n['inputs'].get('image') for n in graph.values() if n.get('class_type') == 'LoadImage']
    guide = [i for i in images if isinstance(i, str) and 'pose-guide' in i]
    models = [n['inputs'].get('unet_name') or n['inputs'].get('ckpt_name')
              for n in graph.values() if n.get('class_type') in ('UNETLoader', 'CheckpointLoaderSimple')]
    loras = [n['inputs'].get('lora_name') for n in graph.values() if 'Lora' in n.get('class_type', '')]
    text = prompt_text(graph)
    words = pose_words(text)
    map_said = bool(re.search(r'pose map|pose figure|OpenPose|stick figure', text, re.I))
    return {
        'images': images,
        'guide': guide[0] if guide else None,
        'mapAttached': bool(guide),
        'mapNamedInText': map_said,
        'models': models,
        'loras': loras,
        'text': text,
        **words,
    }


if __name__ == '__main__':
    cap = json.load(open(sys.argv[1]))
    for row in cap['rows']:
        g = graph_of(row['graph']) if row['graph'] else None
        if not g:
            print(row['target'], 'NO GRAPH')
            continue
        i = info(g)
        print(f"== {row['target']} [{row['engine']}] map={i['mapAttached']} models={i['models']}")
        print('   POSE FIRST:', i['poseFirst'])
        print('   Pose:', i['poseSentence'])
        if '-v' in sys.argv:
            print(i['text'])
