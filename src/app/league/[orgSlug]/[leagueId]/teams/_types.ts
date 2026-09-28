// 팀 페이지와 RosterEditor 가 함께 쓰는 팀 타입 — page.tsx 에서 export 하면 Next 가 페이지 모듈 export 를 검사하므로 따로 둔다.
export type Team = { id: string; name: string; color: string }
