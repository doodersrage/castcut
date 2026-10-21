"""Rig Blender Studio's CC0 human base mesh (female or male realistic) and export a small GLB.

Usage: python build_rig.py <bundle.blend> <female|male> <out.glb> <out-joints.json>
Joint centres were placed by hand on the female mesh (plots of the vertices); the male mesh has
the same topology, so its joints are carried over through the nearest female vertices.
"""
import bpy, sys, json
import numpy as np
from mathutils import Vector

blend, kind, out_glb, out_json = sys.argv[-4:]
# One multires level baked in (a smooth silhouette), then decimated back to ~16k vertices.
MULTIRES_LEVEL = 1
DECIMATE = 0.35
bpy.ops.wm.open_mainfile(filepath=blend)

FEMALE = 'GEO-body_female_realistic'
name = FEMALE if kind == 'female' else 'GEO-body_male_realistic'

# Joint centres on the female mesh (Blender coords relative to the mesh origin: z up, faces -y,
# character left = +x).
J = {
    'hips': (0, -0.012, 0.93), 'spine': (0, -0.03, 1.04), 'chest': (0, -0.03, 1.17),
    'neck': (0, -0.02, 1.38), 'head': (0, -0.025, 1.47), 'headtop': (0, -0.04, 1.64),
    'clav_L': (0.02, -0.01, 1.37), 'shoulder_L': (0.16, 0.0, 1.31), 'elbow_L': (0.245, 0.03, 1.055),
    'wrist_L': (0.345, -0.047, 0.855), 'handend_L': (0.39, -0.075, 0.75),
    'hip_L': (0.085, 0.0, 0.84), 'knee_L': (0.106, 0.0045, 0.453), 'ankle_L': (0.124, 0.015, 0.075),
    'ball_L': (0.13, -0.10, 0.02),
}
for k in list(J):
    if k.endswith('_L'):
        x, y, z = J[k]
        J[k[:-2] + '_R'] = (-x, y, z)


def verts_of(obj):
    return np.array([list(obj.matrix_world @ v.co) for v in obj.data.vertices]) - np.array(list(obj.location))


fem = bpy.data.objects[FEMALE]
obj = bpy.data.objects[name]
if kind != 'female':
    F = verts_of(fem)
    M = verts_of(obj)
    assert len(F) == len(M), 'topologies differ'
    moved = {}
    for k, p in J.items():
        p = np.array(p)
        idx = np.argsort(((F - p) ** 2).sum(1))[:40]
        moved[k] = tuple(M[idx].mean(0) + (p - F[idx].mean(0)))
    J = moved

# Keep only the body and its eyes.
eyes = [c for c in obj.children if c.type == 'MESH']
keep = {obj.name, *[e.name for e in eyes]}
for o in list(bpy.data.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o, do_unlink=True)

base = Vector(obj.location)
for o in [obj, *eyes]:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
for o in [obj, *eyes]:
    o.location -= base
bpy.context.view_layer.update()

# Multires: keep one level of subdivision baked in for a smooth silhouette, then decimate back.
bpy.context.view_layer.objects.active = obj
for o in bpy.context.selected_objects:
    o.select_set(False)
obj.select_set(True)
mr = obj.modifiers.get('Multires')
if mr:
    mr.levels = MULTIRES_LEVEL
    bpy.ops.object.modifier_apply(modifier=mr.name)
for m in list(obj.modifiers):
    obj.modifiers.remove(m)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# A mannequin, not an anatomy model: smooth the groin (and the male's genitals) flat.
import bmesh
bm = bmesh.new()
bm.from_mesh(obj.data)
hip_z = J['hip_L'][2]
region = [v for v in bm.verts if abs(v.co.x) < 0.085 and hip_z - 0.16 < v.co.z < hip_z + 0.06 and v.co.y < 0.0]
print('smoothing', len(region))
for _ in range(40):
    bmesh.ops.smooth_vert(bm, verts=region, factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(obj.data)
bm.free()

# Eyes join the body (one draw call); they keep their own material slot (dark iris).
eye_mat = bpy.data.materials.new('Eyes')
eye_mat.diffuse_color = (0.08, 0.07, 0.07, 1)
body_mat = bpy.data.materials.new('Skin')
body_mat.diffuse_color = (0.82, 0.74, 0.68, 1)
obj.data.materials.clear()
obj.data.materials.append(body_mat)
for e in eyes:
    e.data.materials.clear()
    e.data.materials.append(eye_mat)
    bpy.ops.object.select_all(action='DESELECT')
    e.select_set(True)
    bpy.context.view_layer.objects.active = e
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Armature
arm_data = bpy.data.armatures.new('Rig')
arm = bpy.data.objects.new('Rig', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones

BONES = [
    # name, head, tail, parent, connected
    ('hips', 'hips', 'spine', None, False),
    ('spine', 'spine', 'chest', 'hips', True),
    ('chest', 'chest', 'neck', 'spine', True),
    ('neck', 'neck', 'head', 'chest', True),
    ('head', 'head', 'headtop', 'neck', True),
]
for s in ('L', 'R'):
    BONES += [
        (f'clavicle_{s}', f'clav_{s}', f'shoulder_{s}', 'chest', False),
        (f'upperarm_{s}', f'shoulder_{s}', f'elbow_{s}', f'clavicle_{s}', True),
        (f'forearm_{s}', f'elbow_{s}', f'wrist_{s}', f'upperarm_{s}', True),
        (f'hand_{s}', f'wrist_{s}', f'handend_{s}', f'forearm_{s}', True),
        (f'thigh_{s}', f'hip_{s}', f'knee_{s}', 'hips', False),
        (f'shin_{s}', f'knee_{s}', f'ankle_{s}', f'thigh_{s}', True),
        (f'foot_{s}', f'ankle_{s}', f'ball_{s}', f'shin_{s}', True),
    ]
for bname, h, t, parent, conn in BONES:
    b = eb.new(bname)
    b.head = Vector(J[h])
    b.tail = Vector(J[t])
    # A consistent roll: bones' local z points forward (-y) where possible.
    b.align_roll(Vector((0, -1, 0)) if abs((b.tail - b.head).normalized().y) < 0.9 else Vector((0, 0, 1)))
    if parent:
        b.parent = eb[parent]
        b.use_connect = conn
bpy.ops.object.mode_set(mode='OBJECT')

# Skin: bone heat on the body, eyes rigid to the head.
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
# Bone heat fails on small (metre-scale) meshes: weight copies at 10x scale (transforms applied),
# then copy the vertex groups back by index onto the metre-scale mesh.
big = obj.copy(); big.data = obj.data.copy(); bpy.context.scene.collection.objects.link(big)
bigarm = arm.copy(); bigarm.data = arm.data.copy(); bpy.context.scene.collection.objects.link(bigarm)
for o in (big, bigarm):
    o.scale = (10, 10, 10)
bpy.ops.object.select_all(action='DESELECT')
for o in (big, bigarm):
    o.select_set(True)
bpy.context.view_layer.objects.active = big
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bpy.ops.object.select_all(action='DESELECT')
big.select_set(True); bigarm.select_set(True)
bpy.context.view_layer.objects.active = bigarm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for g in big.vertex_groups:
    ng = obj.vertex_groups.new(name=g.name)
for v in big.data.vertices:
    for ge in v.groups:
        obj.vertex_groups[big.vertex_groups[ge.group].name].add([v.index], ge.weight, 'REPLACE')
bpy.data.objects.remove(big, do_unlink=True)
bpy.data.objects.remove(bigarm, do_unlink=True)
obj.parent = arm
mod = obj.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
missing = [v.index for v in obj.data.vertices if not v.groups]
print('unweighted verts', len(missing))
for e in eyes:
    g = e.vertex_groups.new(name='head')
    g.add([v.index for v in e.data.vertices], 1.0, 'REPLACE')
    e.parent = arm
    mod = e.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm

# Decimate the body to keep the file small.
ratio = DECIMATE
if ratio < 1:
    dec = obj.modifiers.new('Decimate', 'DECIMATE')
    dec.ratio = ratio
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_move_to_index(modifier='Decimate', index=0)
    bpy.ops.object.modifier_apply(modifier='Decimate')

# Join eyes into the body.
bpy.ops.object.select_all(action='DESELECT')
for e in eyes:
    e.select_set(True)
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.join()
obj.name = 'Body'
for p in obj.data.polygons:
    p.use_smooth = True
for uv in list(obj.data.uv_layers):
    obj.data.uv_layers.remove(uv)
print('final verts', len(obj.data.vertices), 'faces', len(obj.data.polygons))

bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format='GLB',
    export_yup=True,
    export_apply=True,
    export_skins=True,
    export_animations=False,
    export_morph=False,
    export_normals=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    use_selection=False,
)

# Extra landmarks (rest, Blender coords → glTF y-up: (x, z, -y)) for the face points.
V = np.array([list(v.co) for v in obj.data.vertices])
def to_gltf(p):
    return [round(float(p[0]), 5), round(float(p[2]), 5), round(float(-p[1]), 5)]
head_verts = V[V[:, 2] > J['head'][2] - 0.02]
nose = head_verts[np.argmin(head_verts[:, 1])]
marks = {'nose': to_gltf(nose)}
# Eyes: the eye meshes' centres (character left = +x).
eye_pts = V[(V[:, 2] > nose[2]) & (V[:, 2] < nose[2] + 0.07) & (V[:, 1] < nose[1] + 0.06)]
for s, sign in (('L', 1), ('R', -1)):
    side = eye_pts[eye_pts[:, 0] * sign > 0.015]
    side = side[np.abs(side[:, 0]) < 0.05]
    marks['eye_' + s] = to_gltf((side.min(0) + side.max(0)) / 2) if len(side) else None
    band = head_verts[(head_verts[:, 2] > nose[2] - 0.01) & (head_verts[:, 2] < nose[2] + 0.04)]
    ext = band[np.argmax(band[:, 0] * sign)]
    marks['ear_' + s] = to_gltf(ext)
marks['joints'] = {k: to_gltf(v) for k, v in J.items()}
json.dump(marks, open(out_json, 'w'), indent=1)
print(json.dumps({k: v for k, v in marks.items() if k != 'joints'}))
