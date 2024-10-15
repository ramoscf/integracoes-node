import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("dp_id", ["dpId"], {})
@Entity("cf_dailyprint")
export class CfDailyprintEntity {
  @Column("bigint", { name: "dp_produto" })
  dpProduto: number;

  @Column("int", { name: "dp_valor", nullable: true })
  dpValor: number | null;

  @Column("int", { name: "dp_dgcartaz" })
  dpDgcartaz: number;

  @Column("int", { name: "dp_dgmotivo" })
  dpDgmotivo: number;

  @Column("int", { name: "dp_empresa" })
  dpEmpresa: number;

  @Column("int", { name: "dp_estabelecimento" })
  dpEstabelecimento: number;

  @Column("int", { name: "dp_usuario" })
  dpUsuario: number;

  @Column("date", { name: "dp_data" })
  dpData: string;

  @Column("time", { name: "dp_hora" })
  dpHora: string;

  @Column("varchar", { name: "dp_tamanho", length: 50 })
  dpTamanho: string;

  @Column("varchar", { name: "dp_fortam", length: 100 })
  dpFortam: string;

  @Column("varchar", { name: "dp_nome", nullable: true, length: 200 })
  dpNome: string | null;

  @Column("varchar", { name: "dp_mobile", nullable: true, length: 1 })
  dpMobile: number | null;

  @PrimaryGeneratedColumn({ type: "int", name: "dp_id", unsigned: true })
  dpId: number;

  @Column("varchar", { name: "dp_qntparcela", length: 10 })
  dpQntparcela: number;

  @Column("varchar", { name: "dp_idtaxa", length: 10 })
  dpIdtaxa: string;

  @Column("int", { name: "dp_auditoria" })
  dpAuditoria: number;
}
