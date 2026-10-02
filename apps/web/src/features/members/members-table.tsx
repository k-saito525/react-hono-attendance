import type { Member } from './queries'

export function MembersTable({ members }: { members: Member[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              名前
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              メール
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              権限
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              入社日
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {members.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-2">{m.name}</td>
              <td className="px-4 py-2 text-gray-600">{m.email}</td>
              <td className="px-4 py-2">
                <span
                  className={
                    m.role === 'admin'
                      ? 'rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800'
                      : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700'
                  }
                >
                  {m.role === 'admin' ? '管理者' : '一般'}
                </span>
              </td>
              <td className="px-4 py-2 text-gray-600">{m.hiredOn}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
