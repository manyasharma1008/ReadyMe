export default function Avatar() {
  return (
    <div className="flex flex-col items-center">
      {/* head */}
      <div className="w-14 h-14 rounded-full bg-gray-300" />

      {/* body */}
      <div className="w-20 h-40 bg-gray-300 mt-2 rounded-t-lg" />

      {/* legs */}
      <div className="flex gap-3 mt-1">
        <div className="w-6 h-28 bg-gray-300 rounded-b-md" />
        <div className="w-6 h-28 bg-gray-300 rounded-b-md" />
      </div>
    </div>
  )
}