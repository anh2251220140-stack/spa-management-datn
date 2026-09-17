import { useEffect, useState } from 'react'
import { getAdminCategories, createCategory, updateCategory } from '../../services/serviceCategoryApi'
import { errorMessage } from '../../utils/errorMessage'
const empty = { name: '', description: '', status: 'active' }
export default function CategoryManagementPage() {
  const [rows,setRows] = useState([]), [form,setForm] = useState(empty), [editId,setEditId] = useState(null)
  const [error,setError] = useState(''), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false), [loading,setLoading] = useState(true)
  async function load() { setLoading(true);try {const response=await getAdminCategories();setRows(response.data.data)} finally {setLoading(false)} }
  useEffect(() => {load().catch(failure => setError(errorMessage(failure)))}, [])
  function reset() {setEditId(null);setForm(empty)}
  async function save(event) {
    event.preventDefault();setError('');setNotice('');if(!form.name.trim()) return setError('Vui lòng nhập tên danh mục.')
    setBusy(true)
    try {if(editId) await updateCategory(editId,form);else await createCategory(form);reset();setNotice('Đã lưu danh mục.');await load()}
    catch(failure){setError(errorMessage(failure))}finally{setBusy(false)}
  }
  async function toggle(row) {
    setBusy(true);setError('');setNotice('')
    try {const status=row.status==='active'?'inactive':'active';await updateCategory(row.id,{status});if(editId===row.id)setForm(current=>({...current,status}));await load();setNotice('Đã cập nhật trạng thái.')}catch(failure){setError(errorMessage(failure))}finally{setBusy(false)}
  }
  return <section><h1 className="text-3xl font-semibold">Quản lý danh mục</h1><p className="mt-3 text-stone-600">Tắt danh mục sẽ ẩn các dịch vụ thuộc danh mục trên trang công khai.</p>{error && <p className="mt-4 text-red-700" role="alert">{error}</p>}{notice && <p className="mt-4 text-emerald-800" role="status">{notice}</p>}
    <form onSubmit={save} className="my-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-6"><h2 className="text-xl font-semibold">{editId ? 'Sửa danh mục' : 'Thêm danh mục'}</h2><label className="block text-sm font-medium">Tên danh mục<input className="form-input" required maxLength={100} value={form.name} onChange={event=>setForm({...form,name:event.target.value})} /></label><label className="block text-sm font-medium">Mô tả<textarea className="form-input" rows={3} value={form.description} onChange={event=>setForm({...form,description:event.target.value})} /></label><label className="block text-sm font-medium">Trạng thái<select className="form-input" value={form.status} onChange={event=>setForm({...form,status:event.target.value})}><option value="active">Hoạt động</option><option value="inactive">Không hoạt động</option></select></label><div className="flex gap-4"><button disabled={busy} className="primary-button">{busy?'Đang xử lý…':'Lưu danh mục'}</button>{editId && <button type="button" disabled={busy} onClick={reset}>Hủy sửa</button>}</div></form>
    {loading?<p role="status">Đang tải…</p>:<div className="overflow-x-auto rounded-xl border border-stone-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-stone-100"><tr><th className="p-4">Danh mục</th><th className="p-4">Trạng thái</th><th className="p-4">Thao tác</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t border-stone-100"><td className="p-4"><strong>{row.name}</strong><p className="mt-1 text-stone-500">{row.description}</p></td><td className="p-4">{row.status==='active'?'Hoạt động':'Không hoạt động'}</td><td className="p-4"><div className="flex gap-4"><button disabled={busy} className="text-emerald-800 underline" onClick={()=>{setEditId(row.id);setForm({name:row.name,description:row.description||'',status:row.status});window.scrollTo({top:0,behavior:'smooth'})}}>Sửa</button><button disabled={busy} className="underline" onClick={()=>toggle(row)}>{row.status==='active'?'Tắt':'Bật'}</button></div></td></tr>)}</tbody></table>{!rows.length && <p className="p-6 text-stone-500">Chưa có danh mục.</p>}</div>}
  </section>
}
