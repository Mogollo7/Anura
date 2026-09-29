const M=require('D:/server/Anura/services/dataset-service/src/mahalanobis.js');
const r=require('./lw_ref.json'); const dim=24;
const {cov,shrinkage}=M.ledoitWolf(r.X.map(x=>Float64Array.from(x)),dim);
const L=M.cholesky(cov,dim); const P=M.precisionDe(L,dim);
console.log('s',shrinkage,r.s,'cov',cov[0],r.cov00,cov[1],r.cov01,'P',P[5*dim+5],r.P55,P[1*dim+2],r.P12);
const mb=r.mu.map(m=>M.blanquear(L,m,dim));
console.log('d', r.Y.map(y=>M.minima(M.blanquear(L,y,dim),mb).distancia), r.d);
console.log('d2', r.Y.map(y=>M.minimaConPrecision(y,r.mu,P,dim).distancia));
console.log('auc',M.auroc(r.a,r.b),r.auc,'p95',M.percentil(r.a,95),r.p95);
